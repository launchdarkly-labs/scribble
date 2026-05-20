# Ideas backlog

Promising but not-yet-pursued directions. Append-only.

## Markdown support — follow-ups

- **Mermaid source anchoring**: after client-side mermaid swaps `<pre class="mermaid">` for SVG, the raw source isn't in the live DOM, so annotations targeting text inside a diagram orphan on reload. Options if it bites: keep a hidden `<template data-mermaid-source>` next to the SVG, or move mermaid rendering server-side via a headless DOM (heavy).
- **Markdown round-trip for resolved comments**: render with a `rendered offset → markdown source offset` map (markdown-it tokens carry positions; marked needs more work). Then `scribble resolve` on an `.md` file becomes a real agent edit primitive — "rephrase this paragraph" → quote in rendered text → resolved → patch the actual `.md` line. v2.
- **MDX / templated markdown**: currently routed away from. If demand appears, consider rendering via the file's own toolchain (esbuild + mdx) rather than scribble's pipeline — preserves the project's intentional presentation.
- **Math source noise in extracted text**: KaTeX inlines the TeX source in a hidden `<annotation>`, so `extractText` sees `x^2` twice (rendered + hidden). Harmless for anchoring, ugly for greps. Strip `.katex-mathml` in `extractText` if it bites.
