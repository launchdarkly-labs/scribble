/**
 * Reader mode. Opt-in, global user preference.
 *
 * When ON, Scribble applies its own opinionated stylesheet to the host
 * document, *fully overriding* the doc's author styles for the standard
 * HTML element set. The result is consistent typography across every doc
 * you open with scribble — the doc's content, scribble's voice.
 *
 * Theme: respects `prefers-color-scheme`; the chrome's light/dark toggle
 * (via `[data-scribble-theme]` on documentElement) overrides that.
 *
 * The scribble *chrome* (sidebar, cards) lives in a closed shadow root and
 * is never affected by host document styles — that isolation is the
 * sibling guarantee to "the doc is fully overridden in reader mode."
 *
 * How the override is reliable:
 *   1. `all: revert` wipes the doc's author rules back to UA defaults on
 *      every element we restyle. Specificity (0,2,1) beats any bare
 *      element selector or single-class selector the doc may have used.
 *   2. We then apply our house style at the same specificity. Source
 *      order resolves ties — our properties win where we set them; reset
 *      defaults stand where we don't.
 *
 * Edge case: a doc using ID selectors (specificity 1,0,0) can still bleed
 * through. We accept that — agent-generated HTML rarely uses IDs for
 * styling. If we hit one in practice we can sprinkle !important.
 */
import { signal, effect } from "@preact/signals-react";

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

/* All rules wrapped under :root[data-scribble-reader] via CSS nesting
   so specificity is (0,2,1)+ — beats any bare-element rule in the doc. */
const READER_CSS = `
:root[data-scribble-reader] {

  /* ─── Theme tokens — light (default) ───────────────────── */
  --srb-bg:        #ffffff;
  --srb-ink:       #1a1a1a;
  --srb-muted:     #555555;
  --srb-rule:      #dddddd;
  --srb-strong:    #000000;
  --srb-surface:   #f6f6f6;
  --srb-code-bg:   #f0f0f0;
  --srb-accent:    #0066cc;
  --srb-accent-line: color-mix(in oklab, #0066cc 40%, transparent);

  /* ─── Theme tokens — dark (system) ─────────────────────── */
  @media (prefers-color-scheme: dark) {
    &:not([data-scribble-theme="light"]) {
      --srb-bg:        #161616;
      --srb-ink:       #e8e8e8;
      --srb-muted:     #9a9a9a;
      --srb-rule:      #2a2a2a;
      --srb-strong:    #ffffff;
      --srb-surface:   #1f1f1f;
      --srb-code-bg:   #232323;
      --srb-accent:    #4d9eff;
      --srb-accent-line: color-mix(in oklab, #4d9eff 45%, transparent);
    }
  }

  /* ─── Theme tokens — dark (explicit override) ──────────── */
  &[data-scribble-theme="dark"] {
    --srb-bg:        #161616;
    --srb-ink:       #e8e8e8;
    --srb-muted:     #9a9a9a;
    --srb-rule:      #2a2a2a;
    --srb-strong:    #ffffff;
    --srb-surface:   #1f1f1f;
    --srb-code-bg:   #232323;
    --srb-accent:    #4d9eff;
    --srb-accent-line: color-mix(in oklab, #4d9eff 45%, transparent);
  }

  /* ─── Reset: wipe author styles on these elements ──────── */
  /* Body is intentionally NOT in the reset list — it lets host scribble's
     body padding-right (which reserves the sidebar) survive. */
  h1, h2, h3, h4, h5, h6,
  p, blockquote,
  ul, ol, li, dl, dt, dd,
  pre, code, kbd, samp,
  table, thead, tbody, tfoot, tr, th, td,
  hr, figure, figcaption, img, svg, video,
  a, em, strong, small, sub, sup, b, i,
  details, summary {
    all: revert;
  }

  /* ─── Body ─────────────────────────────────────────────── */
  /* Match the source doc's measure (max-width 880px ≈ 55rem) and use
     longhand padding-* so we don't clobber host scribble's reserved
     padding-right: 20rem (sidebar room). */
  body {
    background: var(--srb-bg);
    color: var(--srb-ink);
    font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
    margin: 0;
    padding-top: 2rem;
    padding-bottom: 5rem;
    padding-left: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* Constrain block-level direct children to the same measure,
     centered in whatever space remains to the left of the sidebar. */
  body > * {
    max-width: 55rem;
    margin-left: auto;
    margin-right: auto;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  /* ─── Headings ─────────────────────────────────────────── */
  /* Sizes intentionally left at UA defaults (h1=2em, h2=1.5em, h3=1.17em
     etc.) so the rhythm matches typical agent-generated HTML. We set
     line-height and section-break decorations only. */
  h1, h2, h3 { line-height: 1.2; color: var(--srb-ink); }
  h1 {
    padding-bottom: 0.4rem;
    border-bottom: 2px solid var(--srb-strong);
  }
  h2 {
    margin-top: 2.2rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--srb-rule);
  }
  h3 { margin-top: 1.4rem; }
  h4, h5, h6 { color: var(--srb-ink); }

  /* ─── Inline ───────────────────────────────────────────── */
  strong, b { font-weight: 600; }
  em, i { font-style: italic; }
  small { font-size: 0.85em; color: var(--srb-muted); }

  a {
    color: var(--srb-accent);
    text-decoration: underline;
    text-decoration-color: var(--srb-accent-line);
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }
  a:hover { text-decoration-color: var(--srb-accent); }

  /* ─── Code ─────────────────────────────────────────────── */
  code, pre, kbd, samp {
    font: 0.78125rem/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  code {
    background: var(--srb-code-bg);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--srb-ink);
  }
  pre {
    background: var(--srb-surface);
    padding: 0.8rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
    color: var(--srb-ink);
  }
  pre code {
    background: transparent;
    padding: 0;
    font-size: 1em;
  }
  kbd {
    background: var(--srb-surface);
    border: 1px solid var(--srb-rule);
    border-radius: 3px;
    padding: 1px 4px;
  }

  /* ─── Blockquote ───────────────────────────────────────── */
  blockquote {
    border-left: 3px solid var(--srb-rule);
    padding: 0.1rem 0 0.1rem 1rem;
    margin: 1rem auto;
    color: var(--srb-muted);
    font-style: italic;
  }

  /* ─── Lists ────────────────────────────────────────────── */
  ul, ol { padding-left: 1.4rem; }
  li { margin: 0.25rem 0; }

  /* ─── Rules ────────────────────────────────────────────── */
  hr {
    border: 0;
    border-top: 1px solid var(--srb-rule);
    margin: 2rem auto;
    width: 100%;
  }

  /* ─── Tables ───────────────────────────────────────────── */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem auto;
  }
  th, td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--srb-rule);
    vertical-align: top;
  }
  th { background: var(--srb-surface); }

  /* ─── Media ────────────────────────────────────────────── */
  img, svg, video {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1rem auto;
  }
  figure { margin: 1.25rem auto; }
  figcaption {
    font-size: 0.85rem;
    color: var(--srb-muted);
    margin-top: 0.5rem;
    text-align: center;
  }

  /* ─── Details / summary ────────────────────────────────── */
  details { margin: 0.85rem auto; }
  summary { cursor: pointer; color: var(--srb-accent); font-weight: 500; }
}
`;
