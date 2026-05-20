# Working with agents

Scribble pairs naturally with coding agents: you annotate a long doc, the
agent addresses your feedback; or the agent writes a doc, you review it and
it replies. This file covers how to wire that loop together.

If you're an agent reading this by mistake, you want
[`src/skill/SKILL.md`](./src/skill/SKILL.md) instead.

## Recommended: a one-liner to your agent

Open a doc in one terminal, then in your agent prompt:

```text
Load the scribble skill (run `scribble skill` to print it) and address the
open annotations on the current session. Use `scribble watch --unresolved`
to react to new ones as I leave them.
```

The agent runs `scribble skill` itself to discover the workflow, then uses
the CLI to read annotations, resolve them, and pin its own questions. You
stay in the browser and annotate.

That's the whole setup. The rest of this file is the *why* and the
variations.

## The two loops

### Synchronous: "address my feedback"

You annotated, you want everything addressed in one pass, you'll review
when the agent's done.

```bash
# Terminal A (you):
scribble open ./design.md

# Agent runs:
scribble list --unresolved --json
# … addresses each, then resolves:
scribble resolve <id> --reply "..."
```

### Watch: "react as I annotate"

You're reviewing live; the agent picks up each comment as you leave it.

```bash
# Terminal A (you):
scribble open ./design.md

# Agent runs (long-lived):
scribble watch --unresolved
```

`scribble watch` emits NDJSON events — one JSON object per line — as
annotations change:

```jsonc
{"event":"create",  "annotation":{...}}    // new comment from you
{"event":"update",  "annotation":{...}}    // reply added, body edited
{"event":"resolve", "annotation":{...}}    // agent should stop work on this id
{"event":"delete",  "id":"ann_..."}
{"event":"snapshot-end"}                   // emitted once after initial replay
```

Useful flags:

```
--unresolved      only events for open annotations (and resolves of them)
--once            print the current snapshot, then exit
--until-empty     exit 0 when no open annotations remain
--idle 30s        exit 0 if no event arrives within the duration
```

Pair `--unresolved --until-empty` for "address everything, then quit".

## Per-harness notes

Most harnesses just need the prompt above. A few specifics:

- **Claude Code / Codex / pi**: shell tools are first-class — `scribble
  watch` works as a long-running tool with streaming stdout.
- **Cursor**: paste the output of `scribble skill` into a rule file
  (`.cursor/rules/scribble.md`); the agent's run loop handles `watch`.
- **Aider**: `scribble skill > .aider.conventions.md` and start aider
  with `--read .aider.conventions.md`. Aider runs short-lived, so prefer
  the synchronous loop over `watch`.

## Etiquette

- **Substantive resolutions.** "done" is not a resolution. The skill
  teaches this, but it's worth reinforcing in your project rules.
- **Tight quotes for agent questions.** When the agent uses `scribble
  comment add --quote "…"`, short unique quotes anchor reliably; whole
  paragraphs orphan on edits.
- **Don't open the URL.** The browser overlay is for you. Agents that
  fetch `http://localhost:7878/` see the rendered HTML but no annotation
  context — they should use the CLI.
- **One daemon per doc.** Multiple `scribble open` = multiple sessions.
  The CLI auto-resolves to the session whose doc is under your CWD; pass
  `--doc <path>` if that's ambiguous.

## Gotchas

- **`scribble watch` needs a running daemon.** It connects; it doesn't
  start one. Use `scribble open` first, or have the agent bootstrap with
  `scribble open --detach <doc>` for a doc it just produced.
- **NDJSON, not a JSON array.** If you pipe `watch` through `jq`, use
  `jq -c '.'` line-by-line. `jq -s` hangs waiting for EOF that never
  comes.
- **Markdown works the same as HTML.** The agent sees rendered text in
  `exact`/`prefix`/`suffix`, not raw `#`/`*` source.
