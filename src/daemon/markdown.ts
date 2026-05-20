/**
 * Markdown rendering for scribble.
 *
 * Why this exists: scribble's hard rule #2 is "document display is never
 * affected by scribble." That rule applies when the source has presentation
 * (HTML, MDX). Raw .md has none — staring at `# heading` and `[link](url)`
 * source text would defeat the purpose of an annotation tool. So for
 * markdown specifically we *become* the renderer; everything downstream
 * (anchoring, overlay, store) is unchanged because it operates on the
 * rendered DOM/text, same as a hand-written .html document.
 *
 * Rendering happens server-side wherever possible (marked + highlight.js +
 * katex) so the text content the overlay anchors against is stable across
 * client reloads. Mermaid is the one exception: it requires a real DOM,
 * so we emit `<pre class="mermaid">…</pre>` here and let a small host-page
 * runtime (src/markdown-runtime/main.ts) swap it for SVG at load time.
 *
 * Sharp edges, documented:
 *   • Mermaid source text is anchor-able while the SVG hasn't replaced it,
 *     but after the swap the live DOM no longer contains it. Annotations
 *     anchored *inside* a diagram become orphans; comments next to a
 *     diagram should target surrounding prose. Logged to ideas.md.
 *   • KaTeX inlines its source TeX in a hidden <annotation> element, so
 *     `$x^2$` shows up in the extracted text as `x^2x^2` (rendered + hidden
 *     copies). Harmless for anchoring, mildly ugly for greps over the
 *     rendered text.
 *   • Frontmatter (--- … ---) is stripped before rendering.
 */

import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import { gfmHeadingId } from "marked-gfm-heading-id";
import hljs from "highlight.js";

export interface RenderedMarkdown {
  /** The rendered HTML body fragment (no surrounding shell). */
  body: string;
  /** True if the rendered output contains `pre.mermaid` blocks. */
  hasMermaid: boolean;
  /** True if the rendered output contains KaTeX-rendered math. */
  hasMath: boolean;
}

/**
 * Strip a leading YAML/TOML frontmatter block (delimited by `---` or `+++`)
 * before parsing. Returns the body without frontmatter.
 */
function stripFrontmatter(src: string): string {
  const m = src.match(/^(?:---|\+\+\+)\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)\r?\n/);
  return m ? src.slice(m[0].length) : src;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render markdown source to an HTML body fragment + capability flags. */
export function renderMarkdown(source: string): RenderedMarkdown {
  let hasMermaid = false;

  const marked = new Marked(
    markedHighlight({
      langPrefix: "hljs language-",
      highlight(code, lang) {
        // Mermaid is handled by a client-side script — emit the source
        // verbatim and skip highlight.js. We return the *escaped* code
        // wrapped in a sentinel that the renderer override below picks up.
        // (We can't override `code` here directly because markedHighlight
        // intercepts code blocks first; instead we tag the language and
        // let the renderer downstream emit `pre.mermaid`.)
        if (lang === "mermaid") return code; // pass through unmodified
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
          } catch {
            /* fall through */
          }
        }
        return hljs.highlightAuto(code).value;
      },
    }),
  );

  marked.use(gfmHeadingId());
  marked.use(
    markedKatex({
      throwOnError: false,
      // Output both HTML and a hidden MathML annotation; KaTeX CSS hides
      // the latter, but the source TeX stays available for screen readers.
      output: "htmlAndMathml",
    }),
  );

  // Override the `code` renderer so mermaid blocks come out as
  // `<pre class="mermaid">…</pre>` instead of a highlighted `<pre><code>`.
  marked.use({
    renderer: {
      code({ text, lang }) {
        if (lang === "mermaid") {
          hasMermaid = true;
          // Mermaid expects the raw source as text content — no entities
          // for things like `-->`. But we must still escape `<` / `&` to
          // avoid breaking out of the <pre>.
          return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
        }
        // Fall back to the default code-block layout. markedHighlight has
        // already produced highlighted HTML and stored it on the token via
        // the highlight() callback above; marked then wraps it.
        const cls = lang ? ` class="hljs language-${escapeHtml(lang)}"` : ` class="hljs"`;
        // `text` here is already-highlighted HTML when markedHighlight ran.
        return `<pre><code${cls}>${text}</code></pre>\n`;
      },
    },
  });

  const body = marked.parse(stripFrontmatter(source), { async: false }) as string;
  const hasMath = body.includes('class="katex');
  return { body, hasMermaid, hasMath };
}

/**
 * Extract a human-readable title from the first H1 in markdown, falling
 * back to the filename. Used for the <title> of the served shell.
 */
export function extractTitle(source: string, fallback: string): string {
  const stripped = stripFrontmatter(source);
  const m = stripped.match(/^\s*#\s+(.+?)\s*$/m);
  return m?.[1] ?? fallback;
}

/** True if the path looks like a markdown document. */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(path);
}
