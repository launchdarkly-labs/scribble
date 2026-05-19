---
name: scribble-review
description: Collaborates with humans on HTML documents through the Scribble local annotation tool. Use when you have just generated a long HTML artifact the user will review, when the user has annotations to address on an existing doc, or when you need targeted human feedback on a specific section mid-task.
---

# Scribble Review

Scribble is a local annotation tool: a daemon serves an HTML document with an overlay where the human selects text and leaves comments. The agent reads those comments and replies via CLI. This is the HTML analogue of Hunk for diffs.

The TUI/browser is for the user. Do NOT open URLs or screenshot the overlay. Use `scribble` CLI commands to inspect and mutate annotations.

## When to use

- **You generated a long HTML doc** (~200+ lines): offer to open a review session so the human can annotate specific spans instead of describing them in chat.
- **The user already has scribble running** and asks you to address comments: run `scribble session list`, then `scribble list --unresolved --json`.
- **You need targeted feedback** on a specific span mid-task: add an agent-authored annotation pinned to that span and ask the user to reply in the overlay.

Do NOT reach for scribble when the document is short or the question is broad — chat is faster.

## Workflow

```text
1. scribble session list --json                          # find sessions
2. scribble list --unresolved --json --doc <path>        # read open annotations
3. (address each in the doc / answer the user's question)
4. scribble resolve <id> --reply "..." --doc <path>      # close with substance
5. repeat until empty
```

## Commands

```bash
# Session selection: --doc <path> picks one explicitly; if only one is live, auto-resolves.

scribble session list [--json]                  # active daemons
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]                # full annotation, includes quoted text
scribble resolve <id> --reply "..." [--doc <path>]
```

Each annotation includes:

- `target.selector` — W3C selectors pointing at a span of the doc (you mostly read `TextQuoteSelector.exact` to see what the human pointed at)
- `body.value` — the human's note
- `replies[]` — prior back-and-forth
- `status` — `open` or `resolved`

## Hard rules

- **Resolve with a reply** the user will see in the overlay. Do not silently mark resolved — that's the same as ignoring them.
- **Do NOT edit the source HTML while there are open annotations whose quoted text falls inside the section you're rewriting.** Re-anchoring may fail and the user loses the thread. Resolve or explicitly acknowledge first.
- **Address structural / correctness annotations before nits.** Group related ones in a single reply where it makes sense.
- **Don't comment on every annotation just to clear the queue.** A short "applied; moved this paragraph up" is fine; padding isn't.

## Common errors

- *"No active scribble sessions"* — ask the user to run `scribble open <file.html>`.
- *"Multiple active sessions"* — pass `--doc <path>`.
- *"No annotation <id>"* — the user may have removed it, or you have the wrong session selected.

## Output etiquette

When done with a batch, summarize in chat: which annotations you addressed, which you pushed back on (with reasoning), and any open questions. The user will see your per-annotation replies in the overlay; chat is for the meta-summary.
