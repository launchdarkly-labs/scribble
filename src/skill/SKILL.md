---
name: scribble
description: Collaborates with humans on HTML documents through the Scribble local annotation tool. Use when you have just generated a long HTML artifact the user will review, when the user has annotations to address on an existing doc, or when you need targeted human feedback on a specific section mid-task.
---

# Scribble

Scribble is a local annotation tool: a daemon serves a document with an overlay where the human selects text and leaves comments. The agent reads those comments and replies via CLI. Built for reviewing the long specs and artifacts agents produce.

The TUI/browser is for the user. Do NOT open URLs or screenshot the overlay. Use `scribble` CLI commands to inspect and mutate annotations.

## Supported inputs

`scribble open` accepts **`.html` and `.md` directly**. Markdown is rendered server-side by the daemon (marked + highlight.js + katex + mermaid), with stable anchoring against the rendered DOM.

- **Do NOT** convert markdown to HTML before opening it. No pandoc, no `markdown` Python lib, no hand-rolled wrapper. Pass the `.md` file straight to `scribble open`.
- **Do NOT** add styling, themes, or a wrapper page. Scribble is the renderer for markdown; your job is to hand it the source.
- `.mdx` and other templated formats are *not* supported — point the user at their build output (rendered `.html`) instead.

## When to use

- **You generated a long doc** (`.html` or `.md`, ~200+ lines): start a review session for it (see "Bootstrapping" below).
- **The user already has scribble running** and asks you to address comments: start at step 1 of the workflow.
- **You need targeted feedback** on a specific span mid-task: add an agent-authored annotation pinned to that span and ask the user to reply in the overlay.

Do NOT reach for scribble when the document is short or the question is broad — chat is faster.

## Bootstrapping a session yourself

When you've just written (or been pointed at) a doc the user will review, start scribble for them with `--detach`. Pass the source file as-is — `.md` or `.html`:

```bash
scribble open --detach ./report.html
scribble open --detach ./SKILL.md     # markdown works directly, do not pre-convert
# prints JSON: { id, docPath, port, pid, url }
```

`--detach` spawns the daemon as a background process and returns immediately, so your shell isn't tied up. Tell the user the URL printed in `url` and that they can annotate; subsequent `scribble list / resolve / comment add` calls auto-resolve to that session (see Session selection below).

## Workflow

```text
1. scribble session list --json                          # find sessions
2. scribble list --unresolved --json [--doc <path>]      # read open annotations
3. (address each: read surrounding doc context if needed, edit/answer)
4. scribble resolve <id> --reply "..." [--doc <path>]    # close with substance
5. repeat until empty, then summarize in chat
```

## Treat a review as a batch, not a stream

Scribble doesn't notify you when the user adds a comment — they push,
you pull. When the user says **"take a look," "review my comments,"
"address what I left,"** or similar, treat that as the boundary of a
review submission:

1. Run `scribble list --unresolved --json` once at the top of the turn.
2. Read every open annotation as a coherent set, not one at a time.
3. Group related annotations and address them together where it makes
   sense (e.g. three comments all questioning the same approach — one
   reply explaining the rationale beats three separate ones).
4. Use `scribble resolve apply --stdin` to commit the whole batch in one
   shot when you have several replies ready.
5. Summarize in chat *after* the batch is applied.

Do **not** poll `scribble list` between user messages without being asked.
The user's chat message is the "submit review" boundary; respect it.

**Session selection.** Commands auto-resolve the session in this order:

1. If `--doc <path>` is passed, the session whose docPath matches is used.
2. Otherwise, if exactly one session is live, that one.
3. Otherwise, the session whose docPath is under your current working
   directory — useful when working in a project that has a scribble open
   on a doc inside it. (Symlinks like `/tmp → /private/tmp` are resolved.)
4. Otherwise, the CLI errors with the candidate paths so you can pick.

In practice: when you're working in the same directory as the doc, omit
`--doc`; otherwise pass it explicitly.

**Replies render live in the overlay** via WebSocket — the user sees each reply the moment you send it, no refresh needed. Prefer many short in-the-moment replies over one batch dump at the end.

## Commands

```bash
scribble session list [--json]                  # active daemons
scribble list [--unresolved] [--json] [--doc <path>]
scribble get <id> [--doc <path>]                # full annotation, includes quoted text
scribble resolve <id> --reply "..." [--doc <path>]
scribble resolve apply --stdin [--doc <path>]   # batch resolve / reply
scribble comment add --quote "..." --summary "..." [--prefix "..."] [--suffix "..."] [--doc <path>]
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

## Asking the human a targeted question (Flow C)

When you need feedback on a specific span mid-task — e.g. "is this number
right?" or "should this section stay?" — pin a question to the span instead
of asking in chat. The user sees it light up in their overlay and can reply
in place.

```bash
scribble comment add \
  --quote "Q3 revenue grew 12%" \
  --summary "Is this the correct figure? I'm seeing 11.4% in the source data."
```

If the quote appears more than once in the doc, the daemon will reject the
create; pass `--prefix` and/or `--suffix` (≈32 chars of surrounding text)
to disambiguate:

```bash
scribble comment add \
  --quote "step 3" \
  --prefix "on to " \
  --suffix " of the migration" \
  --summary "Did you intend to ship this before or after the deprecation?"
```

What happens next:

- Annotation appears in the user's sidebar **and** auto-opens its ThreadCard
  so they notice the question.
- They reply through the overlay; you see their reply on the next
  `scribble list` or `scribble get <id>`.
- **You** resolve the annotation when the question is settled (the human
  doesn't usually resolve agent-asked questions).

Don't overuse this. A targeted question is great; an interrogation isn't. If
you have many questions, write them up in chat instead.

## Batching resolves and replies

When you have several annotations to address, prefer one batch over N shell
invocations:

```bash
cat <<'JSON' | scribble resolve apply --stdin
{
  "items": [
    { "id": "ann_01H...", "reply": "applied; moved this paragraph up" },
    { "id": "ann_01H...", "reply": "good catch — fixed the off-by-one" },
    { "id": "ann_01H...", "status": "open", "reply": "pushing back: this is intentional, see §3" }
  ]
}
JSON
```

Accepted shapes on stdin: either the wrapped `{ "items": [...] }` form above,
or a bare array `[ { "id": ..., "reply": ... }, ... ]`. Items without an
explicit `status` but with a `reply` are auto-set to `resolved` (set
`"status": "open"` explicitly when you want to leave it open). Replies
default to `author: "agent"`.

## Common errors

- *"No active scribble sessions"* — ask the user to run `scribble open <file.html>`.
- *"Multiple active sessions"* — pass `--doc <path>` to disambiguate.
- *"No annotation <id>"* — the user may have removed it, or you have the wrong session selected.

## Output etiquette

When done with a batch, summarize in chat: which annotations you addressed, which you pushed back on (with reasoning), and any open questions you couldn't resolve from the annotations alone. The user sees per-annotation replies live in the overlay; chat is for the meta-summary and anything that didn't fit in a per-annotation reply.
