/**
 * Build the HTML shell that wraps rendered markdown before scribble's
 * overlay-injection step. Intentionally minimal: typography that doesn't
 * fight the host doc (because we are the host doc), no theme switcher,
 * no accent colors on prose. Light/dark via prefers-color-scheme only.
 *
 * KaTeX CSS and highlight.js CSS are loaded from /_scribble/md/* routes
 * served by the daemon out of node_modules. KaTeX font URLs in the CSS
 * are relative (`fonts/KaTeX_…woff2`), which resolves against the CSS's
 * own URL — that's why the route exposes the whole katex/dist directory.
 */

import type { RenderedMarkdown } from "./markdown";

const PROSE_CSS = `
:root {
  --scribble-md-fg: #1f2328;
  --scribble-md-muted: #59636e;
  --scribble-md-border: #d1d9e0;
  --scribble-md-code-bg: #f6f8fa;
  --scribble-md-link: #0969da;
  --scribble-md-quote-border: #d1d9e0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --scribble-md-fg: #e6edf3;
    --scribble-md-muted: #9198a1;
    --scribble-md-border: #3d444d;
    --scribble-md-code-bg: #151b23;
    --scribble-md-link: #4493f8;
    --scribble-md-quote-border: #3d444d;
  }
  body { background: #0d1117; }
}
html { font-size: 16px; }
body {
  margin: 0;
  color: var(--scribble-md-fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  font-feature-settings: "kern", "liga";
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
.scribble-md-prose {
  max-width: 76ch;
  margin: 3rem auto;
  padding: 0 1.5rem 6rem;
}
.scribble-md-prose h1, .scribble-md-prose h2, .scribble-md-prose h3,
.scribble-md-prose h4, .scribble-md-prose h5, .scribble-md-prose h6 {
  line-height: 1.25;
  margin: 2em 0 0.6em;
  font-weight: 600;
}
.scribble-md-prose h1 { font-size: 2em; margin-top: 0; border-bottom: 1px solid var(--scribble-md-border); padding-bottom: 0.3em; }
.scribble-md-prose h2 { font-size: 1.5em; border-bottom: 1px solid var(--scribble-md-border); padding-bottom: 0.3em; }
.scribble-md-prose h3 { font-size: 1.25em; }
.scribble-md-prose h4 { font-size: 1em; }
.scribble-md-prose p { margin: 0 0 1em; }
.scribble-md-prose a { color: var(--scribble-md-link); text-decoration: none; }
.scribble-md-prose a:hover { text-decoration: underline; }
.scribble-md-prose ul, .scribble-md-prose ol { padding-left: 2em; margin: 0 0 1em; }
.scribble-md-prose li { margin: 0.25em 0; }
.scribble-md-prose li > p { margin: 0.25em 0; }
.scribble-md-prose blockquote {
  margin: 0 0 1em;
  padding: 0 1em;
  color: var(--scribble-md-muted);
  border-left: 0.25em solid var(--scribble-md-quote-border);
}
.scribble-md-prose hr {
  border: 0;
  border-top: 1px solid var(--scribble-md-border);
  margin: 2em 0;
}
.scribble-md-prose code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--scribble-md-code-bg);
  padding: 0.15em 0.35em;
  border-radius: 4px;
}
.scribble-md-prose pre {
  background: var(--scribble-md-code-bg);
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  margin: 0 0 1em;
}
.scribble-md-prose pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 0.875em;
  line-height: 1.5;
}
.scribble-md-prose table {
  border-collapse: collapse;
  margin: 0 0 1em;
  display: block;
  overflow-x: auto;
}
.scribble-md-prose th, .scribble-md-prose td {
  border: 1px solid var(--scribble-md-border);
  padding: 0.4em 0.8em;
}
.scribble-md-prose th { background: var(--scribble-md-code-bg); font-weight: 600; }
.scribble-md-prose img { max-width: 100%; height: auto; }
.scribble-md-prose input[type="checkbox"] { margin-right: 0.4em; }

/* Mermaid */
.scribble-md-prose pre.mermaid {
  background: transparent;
  padding: 0;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--scribble-md-muted);
}
.scribble-md-prose .scribble-mermaid-rendered {
  margin: 1em 0;
  text-align: center;
}
.scribble-md-prose .scribble-mermaid-rendered svg { max-width: 100%; height: auto; }
.scribble-md-prose .scribble-mermaid-error {
  color: #cf222e;
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  padding: 0.5em 1em;
  border-left: 3px solid #cf222e;
  margin-bottom: 0.5em;
}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ShellOptions {
  title: string;
  rendered: RenderedMarkdown;
  /** Full URL of the markdown runtime entry, or null to skip injection. */
  mdRuntimeEntryUrl: string | null;
}

export function buildMarkdownShell(opts: ShellOptions): string {
  const { title, rendered, mdRuntimeEntryUrl } = opts;
  const hljsHref = "/_scribble/md/hljs.css";
  const katexHref = "/_scribble/md/katex/katex.min.css";
  const runtimeTag = mdRuntimeEntryUrl
    ? `<script type="module" src="${mdRuntimeEntryUrl}"></script>`
    : "";
  const katexLink = rendered.hasMath
    ? `<link rel="stylesheet" href="${katexHref}">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${hljsHref}">
${katexLink}
<style>${PROSE_CSS}</style>
</head>
<body>
<main class="scribble-md-prose">
${rendered.body}
</main>
${runtimeTag}
</body>
</html>`;
}
