# AGENTS.md

Guide for agents working **on** the scribble codebase. (Agents working **with** scribble to collaborate on HTML docs should read `src/skill/SKILL.md` instead — different file, different audience.)

## What this is

A local annotation tool: a daemon serves any HTML document with an overlay where humans select text and leave comments; agents read those comments via CLI and reply. Targeted at reviewing the long HTML specs and artifacts that agents now routinely produce.

Three actors:

- **CLI** (`scribble open/list/resolve/comment/session`) — user- and agent-facing
- **Daemon** (`Bun.serve()` in one process per open document) — HTTP + WebSocket, owns the JSONL store
- **Overlay** (React 19, mounted into a closed shadow root on the served HTML) — selection + sidebar + thread cards

All three are in this one Bun project.

## Quick start (development)

```bash
bun install
bun run typecheck                # tsc --noEmit, should be clean
bun src/cli.ts open <some.html>  # opens http://localhost:7878 in a browser
```

Source edits to `src/overlay/*` and `src/daemon/server.ts` rebuild on the next browser refresh (the daemon rebuilds the overlay bundle per `GET /`). No daemon restart needed.

Source edits to the **CLI subcommands** (`src/commands/*`, `src/cli.ts`) take effect on the next `scribble ...` invocation — they run in fresh processes.

## Hard architectural rules

The two principles that organize most of the design:

1. **Scribble UI is *never* affected by document display.** Chrome lives in a closed shadow DOM. The host doc's CSS cannot reach in.
2. **Document display is *never* affected by scribble.** We touch the host page in exactly two ways: (a) inject `<div id="scribble-root"></div><script>` near `</body>`, (b) inject a `<style>` that defines `::highlight()` rules and `body { padding-right: 20rem }`. That's it. No reader mode, no theme application to doc, no font overrides.

These rules survived three reverted reader-mode attempts (see `notes/ideas.md` → "Tried and rejected"). Don't reintroduce them.

## Layout

```
src/
  cli.ts                 subcommand router (+ --version, --help)
  commands/
    _session-registry.ts ~/.scribble/sessions.json read/write + CWD-aware resolve
    open.ts              start a daemon (foreground or --detach)
    list.ts get.ts       read annotations
    resolve.ts           single resolve + 'apply --stdin' batch path
    comment.ts           agent-initiated annotation (Flow C, --quote / --summary)
    session.ts           session list

  daemon/
    server.ts            Bun.serve: HTTP, WS, file watcher, overlay-build-per-request
    store.ts             JSONL read + O_APPEND atomic append
    anchoring.ts         server-side findInDoc (quote → TextQuoteSelector fields)

  overlay/
    main.tsx             React mount, global keydown/click/mousemove, theme styles
    store.ts             signals: annotations, activeId, hoverId, draftRange, orphanedIds
    anchoring.ts         flatten() + locate() + describeRange() against the live DOM
    highlights.ts        sync annotations → CSS.highlights ; annotationAt(x,y) hit-test
    overlay.css          shadow-root-scoped chrome styles
    components/
      Sidebar.tsx        open / resolved / orphaned sections
      SelectionPill.tsx  the floating "Comment ⌘K" affordance
      DraftCard.tsx      new-annotation card
      ThreadCard.tsx     existing-annotation card, follows its anchor on scroll/edit

  shared/types.ts        zod schemas shared by daemon + overlay
  skill/SKILL.md         the skill for agents *using* scribble (not this file)

notes/
  ideas.md               living TODO + tried-and-rejected log

scratch/
  raw-repro.ts           HTTP-level reproduction harness (POST+PATCH+GET loop)
  parallel-repro.ts      concurrent stress test for the JSONL store

build.ts                 cross-compile script (incomplete; overlay-embedding TODO)
package.json             "bin": { "scribble": "./src/cli.ts" } — bun link target
```

## How to do common things

### Add a new CLI subcommand

1. Create `src/commands/<name>.ts` with `export async function <name>(args: string[])`. Mirror `comment.ts` for shape.
2. Add a case in `src/cli.ts`'s `switch (cmd)`.
3. Add a line to `printHelp()`.
4. If it talks to a daemon, call `resolveSession(docFlag)` from `_session-registry.ts`.

### Add a new HTTP endpoint to the daemon

1. Add a route in `src/daemon/server.ts` inside `handleApi()` (or before it for non-`/_scribble/api/*` paths).
2. If the endpoint should push to the overlay, call `broadcast({ type: ... })` and add the new message variant to `WsMessage` in `src/shared/types.ts`.
3. Handle the message in `src/overlay/store.ts`'s `ws.onmessage`.

### Add a new overlay-side signal

1. `export const x = signal(...)` in `src/overlay/store.ts`.
2. Components that read it must call `useSignals()` from `@preact/signals-react/runtime` to subscribe to fine-grained updates.
3. Any cross-signal derived state goes in a `computed(() => ...)` in the same file.

### Add a new highlight layer

1. New `Highlight` instance in `src/overlay/highlights.ts`, registered via `CSS.highlights.set("scribble-<name>", h)`.
2. New `::highlight(scribble-<name>) { ... }` rule in `HOST_STYLES` in `src/overlay/main.tsx`.
3. Drive it from the existing `effect(() => { ... })` in `highlights.ts`.

### Test a tricky concurrency scenario

The store has been bitten before (`store.append` race fixed via `O_APPEND`). Add a repro under `scratch/` modelled on `parallel-repro.ts`. These are not in CI; they're for diagnosis. Keep them committed.

## Coding conventions

- **TypeScript**: strict on. `bun run typecheck` must be clean.
- **Imports**: relative within a folder, `@/...` (the path alias from `tsconfig.json`) across folders.
- **Validation at boundaries**: zod for HTTP request bodies and shared types (`src/shared/types.ts`). Don't trust JSON.
- **JSON-first CLI output**: every CLI command that talks to the daemon should support `--json` and return a stable shape. Agents parse stdout.
- **Async**: prefer `await` over chained `.then()`. The daemon and CLI are not perf-sensitive — clarity wins.
- **Anchoring math** is shared in spirit but not in code: `src/daemon/anchoring.ts` and `src/overlay/anchoring.ts` are independent because one runs on raw HTML and the other on a live DOM. Keep them in sync conceptually (whitespace-flexible fallback, prefix/suffix disambiguation).
- **Styling**: chrome styles in `src/overlay/overlay.css` (shadow-scoped); the `::highlight()` rules and `body { padding-right }` in `HOST_STYLES` in `main.tsx`. **Nothing else** touches the host doc's styling.
- **Pink accent**: `oklch(60% 0.33 340)`. Don't bikeshed; the three theme-system attempts in the rejected pile took longer than the rest of v0 combined.

## Known sharp edges

- **`fs.watch` on the file itself** misses atomic-rename saves. We watch the parent dir and filter by basename. Don't change this without testing with `sed -i ''` and `Bun.write`.
- **The store's `update()` is read-then-append**, which loses on concurrent writes to the same annotation id. Filed in `notes/ideas.md`. Bites only if two agents PATCH the same annotation at the same time, which doesn't happen in practice.
- **The CLI binds `"scribble"` to `./src/cli.ts`** via `package.json`'s `"bin"`. Install path is `bun link` — see README. Compiled-binary distribution (`bun build --compile`) needs overlay-asset embedding, which is in `build.ts` but not finished. Don't ship it until that's done.

## What's intentionally not here

These came up and we explicitly punted:

- Rich-text comment editor (Lexical, etc.) — `textarea` is enough; revisit if it isn't
- Multi-doc sessions per daemon — current model is one daemon per `scribble open`
- Sync engine / multi-user / offline — local-first only
- Reader mode / Flexoki / Tufte / any theming of the host doc — see "Hard architectural rules" #2
- Manual light/dark theme toggle for chrome — `prefers-color-scheme` only

See `notes/ideas.md` for the full living list, including filed-but-not-pursued items.
