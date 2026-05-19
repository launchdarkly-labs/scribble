# scribble

> Local annotation layer for HTML documents, so humans and agents can
> collaborate on rich artifacts the way [Hunk](https://github.com/) lets
> them collaborate on diffs.

You point scribble at any HTML file. It serves the file in your browser
with a thin annotation sidebar overlaid on top. You highlight text and
leave comments. Your agent reads them via CLI and replies. The agent can
also pin its own questions to specific spans, and you reply back. The
document on disk is never touched; comments live in a sidecar JSONL file
beside it.

## Install

Requires [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).

```bash
git clone <this-repo>
cd scribble
bun install
bun link
```

That installs `scribble` on your PATH as a symlink chain back to this
repo. `git pull` updates everything; no rebuild step. `bun unlink` from
this directory removes it.

## Use it

```bash
scribble open ./some.html
```

Opens a browser tab. Select text and press **⌘K** (or click the pill that
appears) to leave a comment. Use **⌘↩** to submit, **Esc** to cancel.
Click any annotation in the sidebar or any highlighted span in the doc to
open its thread.

Annotations are written to `./.scribble/some.html.jsonl` next to the
document — git-friendly, agent-readable, no database.

## With an agent

Point your agent at `src/skill/SKILL.md`. That file teaches it the three
collaboration flows, the commands, and the etiquette (e.g. resolve with
substantive replies, don't edit sections with open annotations pointing
into them).

A typical loop:

```bash
# You annotate in the browser, then:
scribble list --unresolved --json | <agent>

# Agent replies:
scribble resolve <id> --reply "..."

# Or asks you a targeted question:
scribble comment add --quote "Q3 revenue grew 12%" \
  --summary "Is this the correct figure?"
```

The full CLI:

```
scribble open <file.html> [--detach] [--no-open] [--port=N]
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]
scribble resolve <id> --reply "..." [--doc <path>]
scribble resolve apply --stdin [--doc <path>]
scribble comment add --quote "..." --summary "..." [--prefix "..."] [--suffix "..."]
scribble session list [--json]
```

When multiple sessions are live, commands auto-resolve to the one whose
document path is under your current working directory (Hunk's
`--repo .` pattern). Otherwise pass `--doc <path>`.

## Hacking on it

See [AGENTS.md](./AGENTS.md) — architecture, layout, conventions, common
tasks, sharp edges. The same file is symlinked as `CLAUDE.md` for Claude
Code.

## Status

Pre-1.0; daily-driver-ish. The interaction loop, persistence, anchoring,
and re-anchoring on file changes are solid. Distribution beyond `bun link`
is filed but not done. See `notes/ideas.md` for the living TODO and the
list of things explicitly tried and rejected.
