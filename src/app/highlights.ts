/**
 * Sync annotations → CSS Custom Highlight API, on the iframe doc.
 *
 * One Highlight per status (open, resolved, active, hover, draft) so we
 * can style them differently via ::highlight(scribble-open) etc. The
 * highlight rules themselves live in CSS injected into the iframe's head
 * by IframeDoc.tsx — see DOC_HIGHLIGHT_CSS there.
 *
 * The Custom Highlight API is scoped to a Window, so we go through
 * `iframe.contentWindow.CSS.highlights` and construct Ranges via
 * `iframe.contentDocument.createRange()`. The browser correctly applies
 * the highlights to text nodes of that document.
 *
 * Falls back to no-op on browsers without the API; we ship the Track UI
 * regardless so the user still has the affordances they need.
 */
import { Atom, Registry } from "@effect-atom/atom-react";
import type { Annotation, Selector } from "@/shared/types";
import { locate } from "./anchoring";
import {
  annotationsAtom,
  activeIdAtom,
  hoverIdAtom,
  orphanedIdsAtom,
  draftRangeAtom,
  iframeElAtom,
  docTickAtom,
} from "./atoms";

/**
 * Subscribe to all the inputs and re-sync highlights on each change.
 * Returns a cleanup function that removes the registered Highlights and
 * unsubscribes the registry listeners.
 */
export function startHighlightSync(registry: Registry.Registry): () => void {
  let win: Window | null = null;
  let highlights: {
    open: Highlight;
    resolved: Highlight;
    active: Highlight;
    hover: Highlight;
    draft: Highlight;
  } | null = null;

  // Re-init highlights against the current iframe window. Called on
  // mount and whenever the iframe element (re)loads.
  type WinWithHighlights = Window & {
    Highlight: typeof Highlight;
    CSS: { highlights: HighlightRegistry };
  };
  const hasHighlightApi = (w: Window | null): w is WinWithHighlights => {
    if (!w) return false;
    const css = (w as unknown as { CSS?: unknown }).CSS as
      | { highlights?: unknown }
      | undefined;
    return !!css && "highlights" in css;
  };
  const initFor = (iframe: HTMLIFrameElement | null) => {
    teardown();
    if (!iframe) return;
    const w = iframe.contentWindow;
    if (!hasHighlightApi(w)) {
      console.warn("[scribble] CSS Custom Highlight API unavailable in iframe");
      return;
    }
    win = w;
    // Construct Highlights using the iframe window's Highlight class —
    // they're document-scoped, so the constructor must come from there.
    const HClass = w.Highlight;
    highlights = {
      open: new HClass(),
      resolved: new HClass(),
      active: new HClass(),
      hover: new HClass(),
      draft: new HClass(),
    };
    w.CSS.highlights.set("scribble-open", highlights.open);
    w.CSS.highlights.set("scribble-resolved", highlights.resolved);
    w.CSS.highlights.set("scribble-active", highlights.active);
    w.CSS.highlights.set("scribble-hover", highlights.hover);
    w.CSS.highlights.set("scribble-draft", highlights.draft);
    sync();
  };

  const teardown = () => {
    if (hasHighlightApi(win)) {
      win.CSS.highlights.delete("scribble-open");
      win.CSS.highlights.delete("scribble-resolved");
      win.CSS.highlights.delete("scribble-active");
      win.CSS.highlights.delete("scribble-hover");
      win.CSS.highlights.delete("scribble-draft");
    }
    win = null;
    highlights = null;
  };

  const sync = () => {
    if (!highlights) return;
    const iframe = registry.get(iframeElAtom);
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const { open, resolved, active, hover, draft } = highlights;
    open.clear();
    resolved.clear();
    active.clear();
    hover.clear();
    draft.clear();

    const draftRange = registry.get(draftRangeAtom);
    if (draftRange) draft.add(draftRange);

    const list = registry.get(annotationsAtom);
    const aid = registry.get(activeIdAtom);
    const hid = registry.get(hoverIdAtom);

    const orphans = new Set<string>();
    for (const a of list) {
      const r = locate(a.target.selector, doc);
      if (!r) {
        orphans.add(a.id);
        continue;
      }
      if (a.id === aid) active.add(r);
      else if (a.status === "open") open.add(r);
      else resolved.add(r);
      if (a.id === hid) hover.add(r);
    }
    const prev = registry.get(orphanedIdsAtom);
    if (
      prev.size !== orphans.size ||
      [...orphans].some((id) => !prev.has(id))
    ) {
      registry.set(orphanedIdsAtom, orphans);
    }
  };

  // Subscribe to all the inputs that affect highlights.
  const unsubs: Array<() => void> = [
    registry.subscribe(annotationsAtom, sync),
    registry.subscribe(activeIdAtom, sync),
    registry.subscribe(hoverIdAtom, sync),
    registry.subscribe(draftRangeAtom, sync),
    registry.subscribe(docTickAtom, sync),
    registry.subscribe(iframeElAtom, (el) => initFor(el)),
  ];

  // Boot with the current iframe (if any) so first-paint highlights work.
  initFor(registry.get(iframeElAtom));

  return () => {
    for (const u of unsubs) u();
    teardown();
  };
}

/** Find the annotation whose range contains the given iframe-viewport point. */
export function annotationAt(
  x: number,
  y: number,
  list: ReadonlyArray<{ id: string; target: { selector: Selector[] } }>,
  doc: Document,
): string | null {
  for (const a of list) {
    const r = locate(a.target.selector, doc);
    if (!r) continue;
    for (const rect of r.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return a.id;
      }
    }
  }
  return null;
}

/** Bounding rect of an annotation in the iframe's viewport coords. */
export function rectFor(
  ann: Annotation,
  doc: Document,
): DOMRect | null {
  const r = locate(ann.target.selector, doc);
  return r ? r.getBoundingClientRect() : null;
}
