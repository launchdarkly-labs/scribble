# scribble

> **Fast local spec reviews.**

You point scribble at any HTML or markdown file. It serves the file in
your browser with a thin annotation sidebar overlaid on top. You highlight
text and leave comments. Your agent reads them via CLI and replies. The
agent can also pin its own questions to specific spans, and you reply
back. The document on disk is never touched; comments live in a sidecar
JSONL file beside it. Local-first, no service, no account.

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

### Markdown

Markdown files work the same way — you annotate the rendered output, not
the raw `#`/`*`/`[]()` source:

```bash
scribble open ./design-doc.md
```

Supported out of the box:

- **GFM**: tables, task lists, strikethrough, autolinks
- **Code blocks** with syntax highlighting (GitHub theme)
- **Math**: `$inline$` and `$$display$$` (KaTeX)
- **Mermaid** diagrams in ```` ```mermaid ```` blocks
- **Frontmatter** (YAML / TOML) at the top of the file is stripped

`.mdx` and other templated formats aren't supported — those already have an
intentional presentation layer, so point scribble at the build output instead.

## With an agent

Open a doc, then prompt your agent:

```text
Load the scribble skill (run `scribble skill` to print it) and address the
open annotations on the current session. Use `scribble watch --unresolved`
to react to new ones as I leave them.
```

The agent discovers the skill itself, reads comments via the CLI, and
resolves them with replies. See
[WORKING_WITH_AGENTS.md](./WORKING_WITH_AGENTS.md) for the watch loop in
detail, per-harness notes, and etiquette.

The full CLI:

```
scribble open <file.html|file.md> [--detach] [--no-open] [--port=N]
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]
scribble resolve <id> --reply "..." [--doc <path>]
scribble resolve apply --stdin [--doc <path>]
scribble comment add --quote "..." --summary "..." [--prefix "..."] [--suffix "..."]
scribble watch [--unresolved] [--once] [--until-empty] [--idle <dur>]
scribble session list [--json]
scribble skill [--path]
```

When multiple sessions are live, commands auto-resolve to the one whose
document path is under your current working directory. Otherwise pass
`--doc <path>`.

## Hacking on it

See [AGENTS.md](./AGENTS.md) — architecture, layout, conventions, common
tasks, sharp edges. The same file is symlinked as `CLAUDE.md` for Claude
Code.

## Status

Pre-1.0; daily-driver-ish. The interaction loop, persistence, anchoring,
and re-anchoring on file changes are solid. Distribution beyond `bun link`
is the main thing still to do.
