# scribble

Local-first annotation layer for HTML documents, so humans and agents can
collaborate on rich artifacts the way [Hunk](https://github.com/) lets them
collaborate on diffs.

## Install

Requires [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).

```bash
git clone <this-repo> ~/projects/scribble
cd ~/projects/scribble
bun install
bun link              # registers `scribble` on your PATH (via ~/.bun/bin)
```

That's it. `~/.bun/bin/scribble` is now a symlink chain back to
`src/cli.ts` in this repo. `git pull` updates everything — no rebuild step.

To uninstall: `bun unlink` from this directory.

## Quickstart

```bash
scribble open ./some.html          # starts the daemon, opens a browser tab
```

Select text in the document, click the `Comment` pill (or hit `⌘K`), type, `⌘↩`. Comments are written to `.scribble/<doc>.jsonl` next to the file.

## CLI

```bash
scribble open <file.html> [--detach] [--no-open]
                                     # start a daemon for that doc
scribble session list [--json]       # which daemons are running
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]
scribble resolve <id> --reply "..." [--doc <path>]
scribble resolve apply --stdin       # batch resolve/reply from JSON stdin
scribble comment add --quote "..." --summary "..."
                                     # agent-initiated annotation (Flow C)
```

Session selection auto-resolves in this order: `--doc` match, single session, or single session whose docPath is under your current working directory.

## Agent integration

There's a skill at `src/skill/SKILL.md` that teaches agents the workflow. Point your agent at it via its absolute path; the skill itself explains the commands, the three collaboration flows, and the hard rules (resolve with substantive replies, don't edit sections with open annotations pointing into them, etc.).

## Architecture

- **Daemon**: `Bun.serve()` HTTP + WebSocket; serves the user's HTML with our overlay injected near `</body>`. Watches the source file and broadcasts `doc-changed` on edits.
- **Overlay**: React 19 + `@preact/signals-react`, mounted into a closed shadow root. The host doc and the scribble chrome never see each other's CSS.
- **Anchoring**: W3C `TextQuoteSelector` (with prefix/suffix disambiguation) + `TextPositionSelector` fallback, rendered via the CSS Custom Highlight API — no DOM mutation of the host doc.
- **Storage**: append-only JSONL per doc at `.scribble/<doc>.jsonl`, kernel-atomic via `O_APPEND`.
- **Distribution**: `bun link` for the linked source install (current). Compiled single-binary distribution via `bun build --compile` is wired in `build.ts` but not yet the default path — it needs the overlay-asset embedding work before it's user-ready.

## Layout

```
src/
  cli.ts                 subcommand router
  commands/              open, list, get, resolve, comment, session
  daemon/
    server.ts            Bun.serve + WS + file watcher
    store.ts             JSONL read/append (O_APPEND atomic)
    anchoring.ts         server-side quote-to-selectors (Flow C)
  overlay/
    main.tsx             React mount + global keyboard/click/hover
    anchoring.ts         describe/locate W3C selectors in the live DOM
    highlights.ts        CSS.highlights sync (open / resolved / active / hover)
    store.ts             signals + WebSocket sync + orphan tracking
    components/          Sidebar, SelectionPill, DraftCard, ThreadCard
    overlay.css          shadow-root-scoped styles
  shared/types.ts        zod schemas shared by daemon + overlay
  skill/SKILL.md         agent instructions
notes/                   design notes + ideas
scratch/                 ad-hoc test harnesses (parallel-repro.ts etc.)
```
