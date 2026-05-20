/**
 * Coordinates the appearance of the floating ThreadCard with smooth scroll.
 *
 * The problem: ThreadCard used to mount immediately on `activeId` change
 * and reposition each frame as `scrollIntoView`'s smooth scroll progressed
 * — the dialog visibly travelled with the scroll, looking like document
 * content rather than UI chrome.
 *
 * The fix: defer the reveal until the smooth scroll has settled, then
 * reveal iff the target is actually in the visible viewport. ThreadCard
 * renders iff `showThreadForId` matches the active annotation's id.
 *
 * Implementation — on activation we kick off `scrollIntoView({block:
 * "center"})` and resolve the reveal three ways, whichever fires first:
 *   1. If the target is already in the visible viewport, reveal
 *      synchronously (scrollIntoView will be a near-no-op).
 *   2. Otherwise, listen for `scrollend` and reveal once the scroll has
 *      settled — provided the target landed in the viewport. (If the user
 *      interrupted the smooth scroll by dragging away, it won't have.)
 *   3. A generous setTimeout fallback covers browsers without `scrollend`
 *      support (Safari <17.4) and pathological no-event cases.
 *
 * History note: this used to gate the reveal on the target reaching a
 * narrow "center band" (middle 20% of viewport) via IntersectionObserver
 * rootMargin "-40% 0% -40% 0%". That broke whenever scrollIntoView clamped
 * — e.g. an annotation near the document edges can't actually be centered,
 * so the target landed visible-but-outside-the-band and the dialog never
 * opened. Devtools docked happened to mask the bug by shrinking the
 * viewport (effectively lengthening the document and giving scroll more
 * room). The fix is to drop the band and just ask "is it visible?".
 *
 * The IO is also used for the inverse case: if the user scrolls the
 * active annotation out of view, we clear `activeId` so the dialog
 * dismisses. That mirrors the host-doc click-to-deselect behavior.
 *
 * Edge cases worth knowing:
 *   • User drags the page mid-scroll so the target never reaches the
 *     viewport → `scrollend` fires, viewport check fails, dialog stays
 *     hidden. Re-clicking the sidebar item retries.
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

  // Default rootMargin (0) and threshold (0) → fires whenever any pixel
  // of the target enters or leaves the visible viewport. We use this
  // only to auto-dismiss the active selection when the user scrolls the
  // annotation out of view; the activation reveal is driven by
  // scrollend, not this observer.
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = idByTarget.get(entry.target);
      if (!id || id !== activeId.value) continue;
      // Only dismiss if we'd actually revealed the dialog. During the
      // initial activation scroll the target starts off-screen, and we
      // don't want that to count as a "scrolled away" dismiss.
      if (!entry.isIntersecting && showThreadForId.value === id) {
        activeId.value = null;
      }
    }
  });

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

/**
 * Each activation gets a token. If the user clicks a different
 * annotation (or deselects) while a smooth scroll is still in flight,
 * the old scrollend/timeout handlers fire with a stale token and bail.
 */
let activationToken = 0;

function activate(id: string) {
  const el = targetById.get(id);
  if (!el) return;

  const token = ++activationToken;
  const tryReveal = () => {
    if (token !== activationToken) return;
    if (activeId.value !== id) return;
    if (isInViewport(el)) showThreadForId.value = id;
  };

  // (1) Already on-screen → scrollIntoView will be a near-no-op and
  // `scrollend` may not fire. Reveal synchronously.
  if (isInViewport(el)) {
    showThreadForId.value = id;
    el.scrollIntoView({ block: "center" });
    return;
  }

  el.scrollIntoView({ block: "center" });

  // (2) Reveal once the smooth scroll settles, if the target ended up
  // visible. (User may have aborted by dragging the page elsewhere.)
  const onScrollEnd = () => {
    window.removeEventListener("scrollend", onScrollEnd);
    tryReveal();
  };
  window.addEventListener("scrollend", onScrollEnd);

  // (3) Fallback for browsers without scrollend (Safari < 17.4) and for
  // pathological no-event cases. 800ms is a comfortable upper bound on
  // typical smooth-scroll durations.
  setTimeout(() => {
    window.removeEventListener("scrollend", onScrollEnd);
    tryReveal();
  }, 800);
}

/** True iff the element's bounding rect overlaps the visible viewport. */
function isInViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}
