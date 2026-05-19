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
import { connect } from "./store";
import { startHighlightSync } from "./highlights";
// Bun bundles overlay.css as a text string via the css→text loader.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import
import overlayCss from "./overlay.css";

// CSS for the Highlight API ranges — must live in the host document because
// ::highlight() applies to the host's text nodes, not the shadow root's.
const HOST_STYLES = `
::highlight(scribble-open) {
  background-color: color-mix(in oklch, #c2410c 12%, transparent);
  text-decoration: underline;
  text-decoration-color: #c2410c;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
::highlight(scribble-resolved) {
  background-color: color-mix(in oklch, #6b6b6b 8%, transparent);
  text-decoration: underline;
  text-decoration-color: #9ca3af;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-style: dotted;
}
::highlight(scribble-active) {
  background-color: color-mix(in oklch, #c2410c 22%, transparent);
  text-decoration: underline;
  text-decoration-color: #c2410c;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
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
    </StrictMode>,
  );

  // Connect store + highlight sync
  connect();
  startHighlightSync();
}

void bootstrap();
