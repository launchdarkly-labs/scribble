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
import { Sidebar } from "./components/Sidebar";
import { SelectionPill } from "./components/SelectionPill";
import { DraftCard } from "./components/DraftCard";
import { ThreadCard } from "./components/ThreadCard";
import { connect, draftRange, activeId, hoverId, annotations } from "./store";
import { effect } from "@preact/signals-react";
import { startHighlightSync, annotationAt } from "./highlights";
// Bun bundles overlay.css as a text string via the css→text loader.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import
import overlayCss from "./overlay.css";

// CSS for the Highlight API ranges — must live in the host document because
// ::highlight() applies to the host's text nodes, not the shadow root's.
const HOST_STYLES = `
:root {
  --scribble-accent: oklch(60% 0.33 340);
  --scribble-accent-soft: oklch(96% 0.012 340);
  --scribble-active-soft: oklch(92% 0.04 340);
  --scribble-resolved: oklch(70% 0.005 280);
}
@media (prefers-color-scheme: dark) {
  :root {
    --scribble-accent: oklch(72% 0.18 340);
    --scribble-accent-soft: oklch(26% 0.04 340);
    --scribble-active-soft: oklch(34% 0.08 340);
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
/* Make room for the sidebar so it doesn't overlap content. */
body { padding-right: 320px; }
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
      <Sidebar />
      <SelectionPill />
      <DraftCard />
      <ThreadCard />
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

  connect();
  startHighlightSync();

  // After a doc-change reload, restore the previously-active thread once
  // its annotation arrives in the snapshot. Runs once — the dispose cleans
  // up the effect after a hit (or never, if the id is gone).
  let restoreTargetId: string | null = null;
  try {
    restoreTargetId = sessionStorage.getItem("scribble:restore-active");
    sessionStorage.removeItem("scribble:restore-active");
  } catch {}
  if (restoreTargetId) {
    const dispose = effect(() => {
      if (!restoreTargetId) return;
      if (annotations.value.find((a) => a.id === restoreTargetId)) {
        activeId.value = restoreTargetId;
        restoreTargetId = null;
        // Dispose on next microtask so we don't re-enter while computing.
        queueMicrotask(() => dispose());
      }
    });
  }
}

void bootstrap();
