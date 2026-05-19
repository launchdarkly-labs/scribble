# scribble

Local-first annotation layer for HTML documents, so humans and agents can collaborate on rich artifacts the way Hunk lets them collaborate on diffs.

## Status

Pre-v0 scaffold. Architecture is locked, the spine works end-to-end (open → select → comment → persist → broadcast → see in sidebar), the polish is not. See `notes/00-initial-design.html` for the current thinking.

## Quickstart

```bash
bun install
bun run dev open notes/00-initial-design.html
```

Open http://localhost:7878. Select text in the document and a comment box appears. Comments are written to `.scribble/<doc>.jsonl` next to the file.

## CLI

```bash
scribble open <file.html>            # start daemon, open browser
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]
scribble resolve <id> --reply "..." [--doc <path>]
scribble session list [--json]
```

All commands hit the running daemon over HTTP. The agent skill in `src/skill/SKILL.md` teaches agents the loop.

## Build

```bash
bun run build                        # cross-compiles binaries to dist/
```

Produces `scribble-darwin-arm64`, `scribble-linux-x64`, etc. via `bun build --compile`.

## Architecture

- **Daemon**: `Bun.serve()` — HTTP API + WebSocket, serves user doc with overlay injected
- **Overlay**: React 18 + `@preact/signals-react` + Base UI, mounted into a closed shadow root on the user's doc
- **Anchoring**: W3C TextQuoteSelector + TextPositionSelector, rendered via CSS Custom Highlight API
- **Storage**: JSONL sidecar at `.scribble/<doc>.jsonl`
- **Distribution**: single self-contained binary per platform via `bun build --compile`
