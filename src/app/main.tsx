/**
 * SPA entry. The daemon serves a minimal HTML shell at GET /
 * containing #root and a <meta name="scribble-user">. This module is
 * bundled and loaded from that shell; everything from here is React.
 *
 * The doc itself lives in an iframe at GET /_scribble/doc — see
 * IframeDoc.tsx for the bridge that surfaces its DOM to the rest of the
 * app.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RegistryProvider } from "@effect-atom/atom-react";
import { App } from "./App";
// CSS is bundled as text via the css→text loader and injected here.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import
import appCss from "./app.css";

const style = document.createElement("style");
style.setAttribute("data-scribble", "app");
style.textContent = appCss as string;
document.head.appendChild(style);

const mount = document.getElementById("root");
if (!mount) {
  throw new Error("[scribble] #root not found");
}

createRoot(mount).render(
  <StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </StrictMode>,
);
