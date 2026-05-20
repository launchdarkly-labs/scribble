/**
 * Host-page runtime for markdown docs served by scribble.
 *
 * The daemon emits `<pre class="mermaid">…raw source…</pre>` for fenced
 * ```mermaid``` blocks (see src/daemon/markdown.ts). Mermaid needs a real
 * DOM to render, so the conversion happens here, at load time, on the
 * host page (NOT in the overlay's shadow root).
 *
 * This bundle is only loaded when the rendered markdown contained at least
 * one mermaid block — server.ts injects the <script> conditionally. We're a
 * localhost tool, so we don't bother with further lazy/code-splitting tricks;
 * if you're seeing this file at all, you needed it.
 *
 * Anchoring sharp edge: once mermaid replaces the <pre> with an <svg>, the
 * raw source text is no longer in the live DOM. Annotations targeting text
 * inside a diagram become orphans. We do not preserve a hidden source copy
 * for v1 (it would clutter extracted text and offer marginal value); track
 * this in autoresearch.ideas.md if it bites in practice.
 */

import mermaid from "mermaid";

async function renderMermaidBlocks() {
  const blocks = document.querySelectorAll<HTMLElement>("pre.mermaid");
  if (blocks.length === 0) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  });

  let i = 0;
  for (const block of blocks) {
    const source = block.textContent ?? "";
    const id = `scribble-mermaid-${i++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrap = document.createElement("div");
      wrap.className = "scribble-mermaid-rendered";
      wrap.innerHTML = svg;
      block.replaceWith(wrap);
    } catch (err) {
      // Leave the source visible with an error hint — better than a blank.
      const msg = document.createElement("div");
      msg.className = "scribble-mermaid-error";
      msg.textContent = `Mermaid render failed: ${(err as Error).message}`;
      block.parentElement?.insertBefore(msg, block);
    }
  }
}

renderMermaidBlocks();
