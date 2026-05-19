/**
 * Reader mode. Opt-in.
 *
 * Stylesheet is Edward Tufte's tufte.css (vendored, MIT-licensed, see
 * ./tufte.css). It's wrapped in `:root[data-scribble-reader] { ... }` via
 * CSS nesting so it only applies when reader mode is on, and is removed
 * cleanly when it's off.
 *
 * The toggle is a **global user preference** — one key in localStorage,
 * shared across every doc you open with scribble.
 *
 * Theme (light/dark/auto) is shared with the chrome via [data-scribble-theme]
 * on documentElement.
 */
import { signal, effect } from "@preact/signals-react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - text import via Bun's css→text loader
import tufteCss from "./tufte.css";

const STORAGE_KEY = "scribble:reader";
const STYLE_TAG_ID = "scribble-reader-styles";
const ATTR = "data-scribble-reader";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const readerMode = signal<boolean>(readStored());

export function toggleReader() {
  readerMode.value = !readerMode.value;
}

export function initReader() {
  effect(() => {
    const on = readerMode.value;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {}

    if (on) {
      document.documentElement.setAttribute(ATTR, "");
      if (!document.getElementById(STYLE_TAG_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_TAG_ID;
        style.textContent = READER_CSS;
        document.head.appendChild(style);
      }
    } else {
      document.documentElement.removeAttribute(ATTR);
      document.getElementById(STYLE_TAG_ID)?.remove();
    }
  });
}

/* Tufte CSS scoped via native CSS nesting, then our font-stack override.
   `body` etc. inside the wrapper resolve to `:root[data-scribble-reader] body`. */
const READER_CSS = `
:root[data-scribble-reader] {
${tufteCss as string}

  /* ── scribble overrides ── */

  /* Use the system font stack instead of et-book / Palatino. */
  body {
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
  }

  /* Leave room for the sidebar (20rem) on the right. Tufte's body is 87.5%
     of viewport, centered with auto margins — we shrink the right side. */
  body {
    width: auto;
    max-width: none;
    margin-right: calc(20rem + 1rem);
    margin-left: 4rem;
    padding-left: 0;
  }
}
`;
