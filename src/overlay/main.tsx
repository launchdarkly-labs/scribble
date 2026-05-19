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
import { connect, draftRange, activeId } from "./store";
import { startHighlightSync } from "./highlights";
import { initTheme } from "./theme";
import { initReader } from "./reader";
// Bun bundles overlay.css as a text string via the css→text loader.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import
import overlayCss from "./overlay.css";

// CSS for the Highlight API ranges — must live in the host document because
// ::highlight() applies to the host's text nodes, not the shadow root's.
// Flexoki palette; theme switching is driven by [data-scribble-theme] on :root.
const HOST_STYLES = `
:root {
  --scribble-accent:      #A02F6F;  /* flexoki magenta */
  --scribble-accent-soft: color-mix(in oklch, #A02F6F 10%, #FFFCF0);
  --scribble-active-soft: color-mix(in oklch, #A02F6F 22%, #FFFCF0);
  --scribble-resolved:    #B7B5AC;  /* flexoki base-300 */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-scribble-theme="light"]) {
    --scribble-accent:      #CE5D97;
    --scribble-accent-soft: color-mix(in oklch, #CE5D97 16%, #1C1B1A);
    --scribble-active-soft: color-mix(in oklch, #CE5D97 28%, #1C1B1A);
    --scribble-resolved:    #575653;
  }
}
:root[data-scribble-theme="dark"] {
  --scribble-accent:      #CE5D97;
  --scribble-accent-soft: color-mix(in oklch, #CE5D97 16%, #1C1B1A);
  --scribble-active-soft: color-mix(in oklch, #CE5D97 28%, #1C1B1A);
  --scribble-resolved:    #575653;
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
/* Make room for the sidebar. 20rem scales with the user's font-size. */
body { padding-right: 20rem; }
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

  // Mount React. Theme attributes are set on the shadow host element so our
  // overlay.css :host([data-scribble-theme=…]) selectors react to them.
  initTheme(host);
  initReader();

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
    // Esc closes the active thread card
    if (e.key === "Escape" && activeId.value) {
      activeId.value = null;
    }
  });

  connect();
  startHighlightSync();
}

void bootstrap();
