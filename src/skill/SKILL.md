---
name: scribble-review
description: Collaborates with humans on HTML documents through the Scribble local annotation tool. Use when you have just generated a long HTML artifact the user will review, when the user has annotations to address on an existing doc, or when you need targeted human feedback on a specific section mid-task.
---

# Scribble Review

Scribble is a local annotation tool: a daemon serves an HTML document with an overlay where the human selects text and leaves comments. The agent reads those comments and replies via CLI. This is the HTML analogue of Hunk for diffs.

The TUI/browser is for the user. Do NOT open URLs or screenshot the overlay. Use `scribble` CLI commands to inspect and mutate annotations.

## When to use

- **You generated a long HTML doc** (~200+ lines): offer to open a review session so the human can annotate specific spans instead of describing them in chat.
- **The user already has scribble running** and asks you to address comments: start at step 1 below.
- **You need targeted feedback** on a specific span mid-task: add an agent-authored annotation pinned to that span and ask the user to reply in the overlay.

Do NOT reach for scribble when the document is short or the question is broad — chat is faster.

## Workflow

```text
1. scribble session list --json                          # find sessions
2. scribble list --unresolved --json [--doc <path>]      # read open annotations
3. (address each: read surrounding doc context if needed, edit/answer)
4. scribble resolve <id> --reply "..." [--doc <path>]    # close with substance
5. repeat until empty, then summarize in chat
```

**Session selection.** If `session list` returns exactly one session, omit `--doc` — every command auto-resolves. Only pass `--doc <path>` when multiple sessions are live.

**Replies render live in the overlay** via WebSocket — the user sees each reply the moment you send it, no refresh needed. Prefer many short in-the-moment replies over one batch dump at the end.

## Commands

```bash
scribble session list [--json]                  # active daemons
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]                # full annotation, includes quoted text
scribble resolve <id> --reply "..." [--doc <path>]
```

Each annotation includes:

- `target.selector` — W3C selectors pointing at a span. The `TextQuoteSelector.exact` is the literal text the user highlighted; `prefix` and `suffix` give ~32 chars of context on either side.
- `target.source` — the doc path; same as `session.docPath`.
- `body.value` — the human's note.
- `replies[]` — prior back-and-forth on this annotation.
- `status` — `open` or `resolved`.

## Reading more context

`TextQuoteSelector.exact` is usually enough to know what the human pointed at. When it isn't (e.g. they highlighted a vague phrase like "this number" and you need the full paragraph), open the source file:

```bash
# Path is in session.docPath from `scribble session list --json`
grep -n -F "<the exact text>" "<docPath>"
# or for more surrounding context:
sed -n '<line-20>,<line+20>p' "<docPath>"
```

Don't fetch the served `http://localhost:<port>/` — that includes our injected overlay markup and is a worse view than the source file.

## Hard rules

- **Resolve with a substantive reply.** Do not silently mark resolved — that's the same as ignoring the human. A short "applied; moved this paragraph up" is fine; "ok" is not.
- **Do NOT edit the source HTML inside a section that has open annotations whose `TextQuoteSelector.exact` falls in that section.** Re-anchoring may fail and the user loses the thread. Either resolve those annotations first, or acknowledge them in a reply and explain what you're about to change.
- **Address structural / correctness annotations before nits.** Group related ones in a single reply when it makes sense.
- **Don't pad.** Reply length should match the annotation's substance. Test annotations get one line. Real critique gets real engagement.

## Batching

There is no `comment apply --stdin` yet (planned). For now, when there are many annotations:

- Do them one at a time with sequential `scribble resolve` calls — each reply is broadcast live to the user
- Save the chat summary for the end; the per-annotation replies in the overlay are where the user actually reads your work

## Common errors

- *"No active scribble sessions"* — ask the user to run `scribble open <file.html>`.
- *"Multiple active sessions"* — pass `--doc <path>` to disambiguate.
- *"No annotation <id>"* — the user may have removed it, or you have the wrong session selected.

## Output etiquette

When done with a batch, summarize in chat: which annotations you addressed, which you pushed back on (with reasoning), and any open questions you couldn't resolve from the annotations alone. The user sees per-annotation replies live in the overlay; chat is for the meta-summary and anything that didn't fit in a per-annotation reply.
