/**
 * Reader mode. Opt-in, per-document.
 *
 * When ON, injects a Flexoki-themed stylesheet into the host <head> that
 * targets *generic* elements (no class selectors), so barely-styled HTML
 * (the common shape of agent-generated artifacts) reads like a real
 * typeset document. Heavily styled docs may still bleed through — that's
 * accepted; reader mode is for the un- or under-styled case.
 *
 * Theme (light/dark/auto) is shared with the chrome via [data-scribble-theme]
 * on documentElement, set by theme.ts.
 *
 * The toggle is persisted per-doc (keyed by the docPath we expose via a
 * <meta name="scribble-doc">) so each doc remembers its choice.
 */
import { signal, effect } from "@preact/signals-react";

const STYLE_TAG_ID = "scribble-reader-styles";
const ATTR = "data-scribble-reader";

function docKey(): string {
  const m = document.querySelector('meta[name="scribble-doc"]');
  const path = m?.getAttribute("content") || location.pathname;
  return `scribble:reader:${path}`;
}

function readStored(): boolean {
  try {
    return localStorage.getItem(docKey()) === "1";
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
      localStorage.setItem(docKey(), on ? "1" : "0");
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

/* Reader stylesheet. All rules scoped by [data-scribble-reader] on :root so
   they only apply when the mode is on, and they're easy to remove cleanly.
   Light is default; dark kicks in via system pref OR explicit theme override. */
const READER_CSS = `
:root[data-scribble-reader] {
  --srdr-bg:      #FFFCF0;
  --srdr-ink:     #100F0F;
  --srdr-muted:   #6F6E69;
  --srdr-faint:   #B7B5AC;
  --srdr-surface: #F2F0E5;
  --srdr-rule:    #DAD8CE;
  --srdr-accent:  #A02F6F;
}
@media (prefers-color-scheme: dark) {
  :root[data-scribble-reader]:not([data-scribble-theme="light"]) {
    --srdr-bg:      #1C1B1A;
    --srdr-ink:     #F2F0E5;
    --srdr-muted:   #878580;
    --srdr-faint:   #575653;
    --srdr-surface: #282726;
    --srdr-rule:    #403E3C;
    --srdr-accent:  #CE5D97;
  }
}
:root[data-scribble-reader][data-scribble-theme="dark"] {
  --srdr-bg:      #1C1B1A;
  --srdr-ink:     #F2F0E5;
  --srdr-muted:   #878580;
  --srdr-faint:   #575653;
  --srdr-surface: #282726;
  --srdr-rule:    #403E3C;
  --srdr-accent:  #CE5D97;
}

:root[data-scribble-reader] body {
  margin: 0;
  background: var(--srdr-bg);
  color: var(--srdr-ink);
  font-family: system-ui, -apple-system, "SF Pro Text", sans-serif;
  font-size: 1.0625rem;
  line-height: 1.65;
  /* Leave space for the sidebar (20rem) + breathing room */
  padding: 3rem calc(20rem + 2rem) 6rem 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Centre direct children in the available column.
   Affects block-level content; nested elements inherit naturally. */
:root[data-scribble-reader] body > * {
  max-width: 42rem;
  margin-left: auto;
  margin-right: auto;
}

:root[data-scribble-reader] h1,
:root[data-scribble-reader] h2,
:root[data-scribble-reader] h3,
:root[data-scribble-reader] h4,
:root[data-scribble-reader] h5,
:root[data-scribble-reader] h6 {
  font-family: inherit;
  color: var(--srdr-ink);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
:root[data-scribble-reader] h1 { font-size: 2rem; margin: 0 auto 0.5rem; }
:root[data-scribble-reader] h2 {
  font-size: 1.375rem;
  margin: 2.5rem auto 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--srdr-rule);
}
:root[data-scribble-reader] h3 { font-size: 1.125rem; margin: 1.75rem auto 0.5rem; }
:root[data-scribble-reader] h4 {
  font-size: 0.9rem;
  margin: 1.5rem auto 0.4rem;
  color: var(--srdr-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

:root[data-scribble-reader] p {
  margin: 0 auto 1rem;
  font-size: 1rem;
}

:root[data-scribble-reader] strong { font-weight: 600; }
:root[data-scribble-reader] em { font-style: italic; }

:root[data-scribble-reader] a {
  color: var(--srdr-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklch, var(--srdr-accent) 40%, transparent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
:root[data-scribble-reader] a:hover {
  text-decoration-color: var(--srdr-accent);
}

:root[data-scribble-reader] code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.875em;
  background: var(--srdr-surface);
  padding: 0.08em 0.35em;
  border-radius: 0.2rem;
}

:root[data-scribble-reader] pre {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.85rem;
  line-height: 1.55;
  background: var(--srdr-surface);
  padding: 1rem 1.25rem;
  border-radius: 0.4rem;
  overflow-x: auto;
  margin: 1rem auto;
  color: var(--srdr-ink);
}
:root[data-scribble-reader] pre code {
  background: none;
  padding: 0;
  font-size: 1em;
}

:root[data-scribble-reader] blockquote {
  margin: 1.25rem auto;
  padding: 0.1rem 0 0.1rem 1rem;
  border-left: 3px solid var(--srdr-accent);
  color: var(--srdr-muted);
  font-style: italic;
}

:root[data-scribble-reader] ul,
:root[data-scribble-reader] ol {
  margin: 0 auto 1rem;
  padding-left: 1.5rem;
}
:root[data-scribble-reader] li { margin: 0.3rem 0; }
:root[data-scribble-reader] li > ul,
:root[data-scribble-reader] li > ol { margin: 0.25rem 0; }

:root[data-scribble-reader] hr {
  border: 0;
  border-top: 1px solid var(--srdr-rule);
  margin: 2.5rem auto;
}

:root[data-scribble-reader] table {
  border-collapse: collapse;
  margin: 1.25rem auto;
  font-size: 0.9rem;
  width: 100%;
}
:root[data-scribble-reader] th,
:root[data-scribble-reader] td {
  border: 1px solid var(--srdr-rule);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
:root[data-scribble-reader] th {
  background: var(--srdr-surface);
  font-weight: 600;
}

:root[data-scribble-reader] img,
:root[data-scribble-reader] svg,
:root[data-scribble-reader] video {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1rem auto;
}

:root[data-scribble-reader] figure {
  margin: 1.5rem auto;
}
:root[data-scribble-reader] figcaption {
  font-size: 0.85rem;
  color: var(--srdr-muted);
  text-align: center;
  margin-top: 0.5rem;
}

:root[data-scribble-reader] details {
  margin: 1rem auto;
}
:root[data-scribble-reader] summary {
  cursor: pointer;
  color: var(--srdr-accent);
  font-weight: 500;
}
`;
