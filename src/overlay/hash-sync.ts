/**
 * Two-way sync between the `activeId` signal and `location.hash`.
 *
 * Buys us:
 *   • Deep links: http://localhost:7878/#ann_01KS… opens scribble with
 *     that thread active. Useful when an agent prints a URL in its output.
 *   • Survives reloads: the daemon's `doc-changed` broadcast triggers
 *     `location.reload()`, and the hash survives natively — no
 *     sessionStorage stashing needed.
 *   • Back/forward feels right (with `replaceState` it doesn't cycle
 *     through every thread the user clicked).
 *
 * `activeId` stays the source of truth in JS; this module just mirrors
 * it to the URL and listens for external changes (paste, browser nav).
 *
 * Safety: setting `location.hash = "#ann_xxx"` would normally trigger the
 * browser's native scroll-to-anchor. We're safe because no element in
 * the DOM has `ann_xxx` as its id — annotations are CSS Custom
 * Highlights, not DOM elements. The dialog coordinator owns scrolling.
 */
import { effect } from "@preact/signals-react";
import { activeId } from "./store";

const PREFIX = "ann_";

function readHash(): string | null {
  const raw = location.hash.slice(1);
  return raw.startsWith(PREFIX) ? raw : null;
}

export function startHashSync() {
  // Init: if the page loaded with a hash, seed activeId. The dialog
  // coordinator picks it up and scrolls the annotation into view once
  // the annotation list arrives (handled there via a pending-activation
  // stash to bridge the WebSocket snapshot delay).
  const initial = readHash();
  if (initial) activeId.value = initial;

  // Mirror activeId → hash. `replaceState` (not `pushState`) avoids
  // polluting history with one entry per sidebar click; back-button
  // should exit scribble, not cycle through every thread.
  effect(() => {
    const id = activeId.value;
    const target = id ? `#${id}` : "";
    const current = location.hash;
    if (current === target) return;
    if (!target && !current) return;
    history.replaceState(null, "", target || location.pathname + location.search);
  });

  // Mirror hash → activeId for external changes (user paste, back/forward).
  window.addEventListener("hashchange", () => {
    const id = readHash();
    if (activeId.value !== id) activeId.value = id;
  });
}
