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

- [ ] **Click outside an open ThreadCard closes it.** Today only Esc or
  re-clicking the sidebar item closes it. Use `pointerdown` on the document
  (outside the card and outside the sidebar) to clear `activeId`.
- [ ] **Esc closes the active thread card from anywhere.** Already partially
  wired in `main.tsx`'s global keydown — verify it works inside the card too
  (focus may swallow it).
- [ ] **Hover sidebar item → highlight the corresponding span in the doc.**
  Add a `hoverId` signal; `highlights.ts` syncs it as a 4th `Highlight`
  (`scribble-hover`) with a subtle background; clear on mouseleave. No scroll.
- [ ] **Click the highlight in the doc to open ThreadCard.** Spatial
  click-target via `document.elementFromPoint` + range hit-testing across all
  annotation ranges. Closes the loop on "click annotation inline." Hover
  cursor should also change to indicate clickability.

## Visual / theme

- [ ] **Drop the serif quote.** Use `system-ui` / `sans-serif` throughout.
  Quotes don't need to be stylized — italic + thin left bar is enough.
- [ ] **Respect the user's base font size.** Don't set body or chrome font-size
  to a fixed px; use `rem` everywhere and let the user's browser default
  (usually 16px) take effect. Same for the host doc — we shouldn't force a size.
- [ ] **Adopt [Flexoki](https://stephango.com/flexoki) as the theme.** Replace
  the ad-hoc pink/oklch palette with Flexoki's named colors. Support
  system/light/dark via `prefers-color-scheme` *and* an explicit override.
  Pick a single Flexoki accent (probably `magenta` or `purple`) for highlights
  and active states.

## Sidebar

- [ ] **Resizable sidebar.** Drag handle on the left edge, persisted width in
  `localStorage`, sync `document.body.style.paddingRight` so the host doc
  reflows in step. Min ~240px, max ~520px.

## Agent flows

- [ ] **Flow C: agent-initiated annotation.** New CLI:
  `scribble comment add --doc <path> --quote "..." --summary "..."` that
  creates an annotation with `author: "agent"`, anchored by searching the
  document for the quoted text. Forces us to design:
  - How the human finds out (sidebar badge? a brief overlay flash on the
    annotated span? both?)
  - How the human replies — same ThreadCard, just initiated by the agent.
  - What "resolve" means when an agent asked the question — does the human
    resolve, or does the agent see the reply and resolve themselves?
- [ ] **Batch operations: `scribble resolve apply --stdin`.** Skill currently
  calls this out as a TODO. Accept a JSON array of `{ id, reply, status? }` on
  stdin, validate the full batch, then mutate. Mirror Hunk's
  `comment apply --stdin`.

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
