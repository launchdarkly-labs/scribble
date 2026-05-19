/**
 * Sync annotations → CSS Custom Highlight API.
 *
 * One Highlight registered per status (open, resolved, active) so we can
 * style them differently via ::highlight(scribble-open) etc.
 *
 * Falls back to no-op on browsers without the API (we ship our own UI
 * indicators in the sidebar regardless).
 */
import { effect } from "@preact/signals-react";
import type { Annotation } from "@/shared/types";
import { locate } from "./anchoring";
import { annotations, activeId } from "./store";

const supported = typeof CSS !== "undefined" && "highlights" in CSS;

export function startHighlightSync() {
  if (!supported) {
    console.warn("[scribble] CSS Custom Highlight API not supported; skipping highlights");
    return;
  }
  const open = new Highlight();
  const resolved = new Highlight();
  const active = new Highlight();
  CSS.highlights.set("scribble-open", open);
  CSS.highlights.set("scribble-resolved", resolved);
  CSS.highlights.set("scribble-active", active);

  effect(() => {
    const list = annotations.value;
    const activeIdValue = activeId.value;
    open.clear();
    resolved.clear();
    active.clear();
    for (const a of list) {
      const r = locate(a.target.selector, document.body);
      if (!r) continue;
      if (a.id === activeIdValue) active.add(r);
      else if (a.status === "open") open.add(r);
      else resolved.add(r);
    }
  });
}

/** Resolve an annotation to its current DOMRect, for positioning floating cards. */
export function rectFor(ann: Annotation): DOMRect | null {
  const r = locate(ann.target.selector, document.body);
  return r ? r.getBoundingClientRect() : null;
}
