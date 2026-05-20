/**
 * Coordinates the appearance of the floating ThreadCard with smooth scroll.
 *
 * The problem: ThreadCard used to mount immediately on `activeId` change
 * and reposition each frame as `scrollIntoView`'s smooth scroll progressed
 * — the dialog visibly travelled with the scroll, looking like document
 * content rather than UI chrome.
 *
 * The fix: defer the reveal until the target has reached the viewport's
 * center band. One IntersectionObserver watches all annotation targets
 * with a narrow center-band `rootMargin` ("-40% 0% -40% 0%"), so it only
 * fires positive when the scroll has settled the target near the middle
 * of the viewport. ThreadCard renders iff `showThreadForId` matches the
 * active annotation's id.
 *
 * Re-observing on activation forces the IO to deliver a fresh
 * intersection-state callback for that target on the next microtask. That
 * handles the "click an already-centered annotation" case without
 * special-casing it: if the target is already in the center band, IO fires
 * positive on next tick; if not, the smooth scroll proceeds and IO fires
 * when the target crosses in.
 *
 * Edge cases worth knowing:
 *   • User interrupts the smooth scroll by manually scrolling past the
 *     target → IO never fires positive → dialog stays hidden. The
 *     observer keeps watching, so scrolling back to the annotation later
 *     reveals it. (No timer fallback needed — see conversation history.)
 *   • Hash deep-link arrives before annotations have loaded → `activeId`
 *     references a target we can't observe yet. We stash the id in
 *     `pendingActivationId` and resolve it when the annotations effect
 *     observes the matching target.
 *   • An annotation's target moves due to DOM edits (doc-changed reload
 *     re-renders, locate() finds a different element) → the sync effect
 *     unobserves the old element and observes the new one.
 */
import { effect } from "@preact/signals-react";
import { annotations, activeId, showThreadForId } from "./store";
import { locate } from "./anchoring";

const CENTER_BAND_ROOT_MARGIN = "-40% 0% -40% 0%";

const targetById = new Map<string, Element>();
const idByTarget = new WeakMap<Element, string>();
let io: IntersectionObserver | null = null;
let pendingActivationId: string | null = null;

function elementFor(range: Range): Element | null {
  const start = range.startContainer;
  return start.nodeType === Node.TEXT_NODE
    ? (start as Text).parentElement
    : (start as Element);
}

export function startDialogCoordinator() {
  if (typeof IntersectionObserver === "undefined") return;

  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = idByTarget.get(entry.target);
        if (!id) continue;
        // Only reveal when the centered target matches the active id.
        // Intersection changes on non-active targets are ignored —
        // they're observed only so this same callback can react if/when
        // they become active later.
        if (entry.isIntersecting && id === activeId.value) {
          showThreadForId.value = id;
        }
      }
    },
    { rootMargin: CENTER_BAND_ROOT_MARGIN, threshold: 0 },
  );

  // Keep the observed-target set in sync with the annotations list.
  // Runs on snapshot, upserts, removes, and after doc-changed reloads.
  effect(() => {
    if (!io) return;
    const live = new Set<string>();
    for (const ann of annotations.value) {
      const range = locate(ann.target.selector, document.body);
      const el = range ? elementFor(range) : null;
      if (!el) continue;
      live.add(ann.id);
      const existing = targetById.get(ann.id);
      if (existing === el) continue;
      if (existing) io.unobserve(existing);
      targetById.set(ann.id, el);
      idByTarget.set(el, ann.id);
      io.observe(el);
    }
    for (const [id, el] of targetById) {
      if (live.has(id)) continue;
      io.unobserve(el);
      targetById.delete(id);
      if (showThreadForId.value === id) showThreadForId.value = null;
    }
    // A hash-driven activation may have arrived before its annotation
    // was observable; resolve it now that the target is in our map.
    if (pendingActivationId && targetById.has(pendingActivationId)) {
      activate(pendingActivationId);
      pendingActivationId = null;
    }
  });

  // On every activation, hide the dialog and kick off the scroll. The
  // IO callback re-reveals it when the target settles in the center band.
  effect(() => {
    const id = activeId.value;
    showThreadForId.value = null;
    if (!id) {
      pendingActivationId = null;
      return;
    }
    if (targetById.has(id)) activate(id);
    else pendingActivationId = id;
  });
}

function activate(id: string) {
  if (!io) return;
  const el = targetById.get(id);
  if (!el) return;
  // Re-observing forces a fresh "current state" callback on the next IO
  // tick. If the target is already in the center band the dialog reveals
  // on the next microtask (~1 frame); otherwise the IO fires positive
  // when the smooth scroll brings the target into the band.
  io.unobserve(el);
  io.observe(el);
  el.scrollIntoView({ block: "center" });
}
