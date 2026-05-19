# Ideas & TODOs

Living list. Roughly grouped, not strictly ordered. Strikethrough or remove as
they ship.

## Bugs / correctness

- [ ] **Overlay bundle is cached at daemon startup.** Every overlay code change
  requires `kill <pid>` + restart. Either (a) rebuild on file change via a
  watcher, or (b) rebuild on every `GET /` in dev. Probably (b) for simplicity
  — dev-only, prod path serves a pre-built static bundle.
- [ ] **Read-after-write latency.** `scribble list` immediately after
  `scribble resolve` shows the old status for one tick. Data on disk is correct.
  Hypothesis: `Bun.file` stat caching, or kernel page-cache propagation timing.
  Repro: write a tiny test that PATCHes then GETs in a tight loop. If `Bun.file`
  is the culprit, swap to `node:fs` `readFile`. ~30 min.

## Interaction polish

- [x] **Click outside an open ThreadCard closes it.** Folded into the
  global click listener.
- [x] **Esc closes the active thread card / draft from anywhere.** Global
  keydown handler clears `draftRange` first, else `activeId`.
- [x] **Hover sidebar item → highlight the corresponding span in the doc.**
  `hoverId` signal + `scribble-hover` Highlight, layered additively.
- [x] **Click the highlight in the doc to open ThreadCard.** Implemented via
  `annotationAt(x, y)` doing range-rect hit-testing on `click`. Toggles off
  when clicking the same annotation again.
- [x] **Hover annotated doc text → highlight + pointer cursor.** rAF-throttled
  mousemove drives `hoverId` + `body.style.cursor`. Same hit-test as click,
  so hover and click never disagree.
- [ ] **Cache `locate()` per annotation id** to avoid re-walking the doc's
  text on every frame of mousemove. Invalidate on annotations signal change.
  Trivial — only worth it if a heavily-annotated long doc feels janky.

## Visual / theme

- [x] **Drop the serif quote.** Use `system-ui` / `sans-serif` throughout.
  Quotes don't need to be stylized — italic + thin left bar is enough.
- [x] **Respect the user's base font size.** Don't set body or chrome font-size
  to a fixed px; use `rem` everywhere and let the user's browser default
  (usually 16px) take effect.

## Sidebar

- [ ] **Resizable sidebar.** Drag handle on the left edge, persisted width in
  `localStorage`, sync `document.body.style.paddingRight` so the host doc
  reflows in step. Min ~240px, max ~520px.

## Agent flows

- [x] **Flow C: agent-initiated annotation.** `scribble comment add --quote
  ... --summary ...` creates an `author: "agent"` annotation, with server-side
  anchoring (whitespace-flexible regex fallback, prefix/suffix disambiguation
  when the quote isn't unique). The overlay auto-opens the ThreadCard on
  receipt so the human notices the question. The agent resolves once the
  reply is in.
- [x] **Batch operations: `scribble resolve apply --stdin`.** Accepts either
  `{ items: [...] }` or a bare array of `{ id, reply?, status? }`. Items
  with a reply default to `status: resolved`. Daemon validates the full
  batch, applies sequentially, broadcasts each upsert, returns counts +
  per-id not-found list.

## Robustness

- [ ] **Re-anchoring on file change.** Watch the source HTML for edits; on
  change, re-locate every annotation via `TextQuoteSelector`. Annotations
  whose `exact` text can no longer be found go into an "orphaned" bucket the
  user can re-place or dismiss. Broadcast over WS.

## Distribution

- [ ] **Production build polish.**
  - Minified bundle (`bun build --minify`)
  - Embed the skill markdown into the binary via `with { type: "file" }`
  - Cross-platform binary release via GitHub Actions
  - Homebrew tap that wraps the GitHub release
  - macOS code-signing + notarization

---

## Captured but not committed to

These came up but we explicitly punted:

- Rich-text comments (Lexical) — only if textarea hits real friction
- Multi-doc sessions per daemon — current model is one doc per `scribble open`
- Authentication / multi-user — Scribble is local-first by design
- Agent reply citation metadata (`Reply.contextRange`) — nice-to-have for
  agent reasoning audit; revisit after Flow C ships

### Tried and rejected

- **Flexoki palette for chrome.** Replaced our pink oklch accent with Flexoki
  magenta + base scales. Felt clinical for a small annotation overlay; the
  ad-hoc pink (`oklch(60% 0.33 340)`) reads better in the few square inches
  of chrome we have. Reverted.
- **Manual light/dark/auto theme toggle.** Built it as part of the Flexoki
  pass. Adds chrome (a toggle button) for very little value vs.
  `prefers-color-scheme` alone in a local-first tool. Reverted.
- **Reader mode** (Flexoki, then Tufte CSS, then a scribble house style
  modeled on a sample doc). Three attempts. The fundamental problem: as soon
  as we start theming the host doc we're a reader app, not an annotation
  tool. Scribble's value is being invisible to the doc — chrome on top, no
  opinion about content. Reverted all three. **Principle**: scribble UI is
  *never* affected by document display; document display is *never* affected
  by scribble.
