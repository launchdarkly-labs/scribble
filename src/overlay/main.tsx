/**
 * Overlay entrypoint. Mounts React into a closed shadow root attached to
 * #scribble-root in the host document, so the document's styles cannot
 * leak into us and our styles cannot leak out.
 *
 * The CSS Custom Highlight API operates on the host document directly,
 * so highlight rules need to live in the LIGHT DOM — we inject a tiny
 * <style> tag into the host <head> for those.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Track } from "./components/Track";
import { SelectionPill } from "./components/SelectionPill";
import { connect, draftRange, activeId, hoverId, annotations } from "./store";
import { startHighlightSync, annotationAt } from "./highlights";
import { startHashSync } from "./hash-sync";
import { startDialogCoordinator } from "./dialog-coordinator";
// Bun bundles overlay.css as a text string via the css→text loader.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import
import overlayCss from "./overlay.css";

// CSS for the Highlight API ranges — must live in the host document because
// ::highlight() applies to the host's text nodes, not the shadow root's.
const HOST_STYLES = `
html {
  /* Scroll smoothly when ThreadCard calls scrollIntoView on the annotated
     element. CSS-side as well as JS-side is belt-and-suspenders; CSS
     also automatically honors prefers-reduced-motion, which the JS-passed
     behavior: smooth option does not reliably do across browsers. */
  scroll-behavior: smooth;
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
:root {
  --scribble-accent: oklch(52% 0.32 264.84);
  --scribble-accent-soft: oklch(96% 0.025 264.84);
  --scribble-active-soft: oklch(92% 0.06 264.84);
  --scribble-resolved: oklch(70% 0.005 280);
}
@media (prefers-color-scheme: dark) {
  :root {
    --scribble-accent: oklch(72% 0.20 264.84);
    --scribble-accent-soft: oklch(28% 0.06 264.84);
    --scribble-active-soft: oklch(36% 0.10 264.84);
    --scribble-resolved: oklch(45% 0.005 280);
  }
}
::highlight(scribble-open) {
  background-color: var(--scribble-accent-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
::highlight(scribble-resolved) {
  text-decoration: underline;
  text-decoration-color: var(--scribble-resolved);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-style: dotted;
}
::highlight(scribble-active) {
  background-color: var(--scribble-active-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
::highlight(scribble-hover) {
  background-color: var(--scribble-active-soft);
}
::highlight(scribble-draft) {
  background-color: var(--scribble-active-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
/* Make room for the annotation track so it doesn't overlap content. */
body { padding-right: 360px; }
`;

function bootstrap() {
  // Inject host styles
  const hostStyle = document.createElement("style");
  hostStyle.setAttribute("data-scribble", "host");
  hostStyle.textContent = HOST_STYLES;
  document.head.appendChild(hostStyle);

  // Build shadow root
  const host = document.getElementById("scribble-root");
  if (!host) {
    console.error("[scribble] #scribble-root not found");
    return;
  }
  const shadow = host.attachShadow({ mode: "closed" });

  // overlay.css is bundled into the JS as a string and injected here so it
  // lives inside the shadow root (and only inside the shadow root).
  const style = document.createElement("style");
  style.textContent = overlayCss as string;
  shadow.appendChild(style);

  // Mount React
  const mount = document.createElement("div");
  shadow.appendChild(mount);
  createRoot(mount).render(
    <StrictMode>
      <Track />
      <SelectionPill />
    </StrictMode>,
  );

  // Global ⌘K: if there's a doc selection, start a comment.
  // Closed shadow DOM means document.getSelection() cannot see selections
  // inside the overlay, so this safely ignores selections in our own UI.
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        e.preventDefault();
        draftRange.value = sel.getRangeAt(0).cloneRange();
        sel.removeAllRanges();
      }
    }
    // Esc closes whatever's open
    if (e.key === "Escape") {
      if (draftRange.value) draftRange.value = null;
      else if (activeId.value) activeId.value = null;
    }
  });

  // Hover over the host doc: light up the annotation under the cursor and
  // switch to a pointer cursor for discoverability. Throttled to rAF so
  // we hit-test at most once per frame regardless of mousemove rate.
  let raf = 0;
  let lastX = 0;
  let lastY = 0;
  document.addEventListener("mousemove", (e) => {
    const target = e.target as Element | null;
    if (target?.closest?.("#scribble-root")) return; // sidebar handles its own hover
    lastX = e.clientX;
    lastY = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const id = annotationAt(lastX, lastY, annotations.value);
      if (hoverId.value !== id) hoverId.value = id;
      document.body.style.cursor = id ? "pointer" : "";
    });
  });
  // Drop hover when the cursor leaves the document entirely
  document.addEventListener("mouseleave", () => {
    if (hoverId.value !== null) hoverId.value = null;
    document.body.style.cursor = "";
  });

  // Click in the host doc:
  //   • in scribble chrome → ignore (closed shadow root retargets to host)
  //   • on an annotated range → open / toggle that annotation's ThreadCard
  //   • anywhere else → close the active ThreadCard
  document.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (target?.closest?.("#scribble-root")) return;

    const id = annotationAt(e.clientX, e.clientY, annotations.value);
    if (id) {
      activeId.value = activeId.value === id ? null : id;
      return;
    }
    if (activeId.value) activeId.value = null;
  });

  // Order matters here:
  //   1. startHashSync() seeds activeId from any incoming #ann_… hash so
  //      the coordinator's activation effect sees it on first run.
  //   2. startDialogCoordinator() registers the IntersectionObserver and
  //      effects. With an empty annotations list it'll stash a pending
  //      activation id (if any) until the WS snapshot arrives.
  //   3. connect() opens the WebSocket; the snapshot triggers the
  //      sync effect, which resolves any pending activation.
  //   4. startHighlightSync() draws CSS Highlights for those annotations.
  startHashSync();
  startDialogCoordinator();
  connect();
  startHighlightSync();
}

void bootstrap();
