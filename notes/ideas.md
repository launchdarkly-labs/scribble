# Ideas & TODOs

Living list. Roughly grouped, not strictly ordered. Strikethrough or remove as
they ship.

## Bugs / correctness

- [x] **Overlay bundle is cached at daemon startup.** Now rebuilt on every
  `GET /`. Asset responses are `Cache-Control: no-store`. Source edits show
  up on browser refresh, no daemon restart.
- [x] **Read-after-write inconsistency.** Root cause turned out to be much
  worse than "stale read": `store.append` was a read-modify-write that
  raced under concurrency, losing records entirely (~50% loss at 8 parallel
  writers in repro). Replaced with `node:fs/promises.appendFile` which uses
  `O_APPEND` — kernel-atomic. Repros now show 0/512 lost or stale at 16
  parallel workers. Test harness at `scratch/parallel-repro.ts` and
  `scratch/raw-repro.ts`.
- [ ] **Lost-update race in `store.update`.** Two concurrent PATCHes on the
  *same annotation id* can both read v1, both compute their own v2, and the
  later append wins (the earlier one's edit is logically lost — the record
  is on disk but `readAll` keeps last-by-id). Different class of race from
  the appendFile one: no data corruption, just last-writer-wins on logical
  edits. Tolerable for human+agent on the same annotation; worth fixing
  with a per-doc write mutex if it ever bites.

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

- [x] **Re-anchoring on file change.** Daemon watches the *parent directory*
  (survives atomic-rename-on-save by every editor/tool we tried: sed,
  Bun.write, vim, VS Code), debounces 150ms, broadcasts `doc-changed`.
  Browser saves `activeId` to sessionStorage and reloads. After reload,
  `locate()` re-runs against the fresh DOM via the existing highlight-sync
  effect; annotations it can't find go into a derived `orphanedIds` signal
  and render in their own sidebar section, with line-through quote + "not
  found" pill + click disabled (no Range to anchor a card to). Orphan
  status is *never persisted* — it's recomputed from current doc + current
  selectors on every effect tick, so re-introducing the quoted text
  un-orphans automatically.

## Reviews as first-class artifacts

- [ ] **`scribble review submit`.** Adds an explicit review-submit primitive,
  GitHub PR style. CLI: `scribble review submit --verdict <approve|request-changes|comment> --message "..."`. Appends a `{type:"review", id, verdict, message, annotations: [<open ids at submit time>], author, submitted}` record to the JSONL and broadcasts it over WS. Doesn't change annotation state — comments are always live; this just creates the *artifact* of "Alice reviewed at this point with this verdict and overall take."

  Browser side: a "Submit review" button at the top of the sidebar that
  opens a small form (textarea + 3-button verdict picker), bundles all
  currently-open annotations into the new review record.

  Why later, not now: for solo use the user's chat message to the agent
  does the same job. Earns its keep when `.scribble/` is git-tracked and
  the team wants "Alice approved spec v3 with these caveats" as a real
  record, not just a chat artifact. Trigger to revisit: when the team
  workflow actually starts using `.scribble/` in PRs.

  Explicitly *not* doing alongside it: "pending" annotations (draft state
  visible only to author until submit). Adds real complexity to every
  read path; the local-first model means there's no other reader to hide
  from anyway.

## Agent UX

- [x] **`scribble open --detach`.** Spawns the daemon as a detached child,
  polls the session registry for the child's pid to appear, prints session
  info as JSON (`{id, docPath, port, pid, url}`) and exits. The agent can
  now bootstrap a review session from a fresh HTML artifact without
  blocking its shell.

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
