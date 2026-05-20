/**
 * `scribble watch` — stream annotation events as NDJSON from a running
 * daemon. The intended consumer is an agent that wants to react as
 * comments appear, rather than polling `list` on a timer.
 *
 * The daemon already broadcasts upsert/remove messages over the same
 * WebSocket the browser overlay uses; this command is a thin client that
 * unwraps those messages into semantic events keyed for CLI consumers:
 *
 *   {"event":"create",   "annotation":{...}}
 *   {"event":"update",   "annotation":{...}}
 *   {"event":"resolve",  "annotation":{...}}
 *   {"event":"delete",   "id":"ann_..."}
 *   {"event":"snapshot-end"}      // emitted once after the initial snapshot
 *
 * The semantic difference between `upsert` (the wire shape) and
 * create/update/resolve (the CLI shape) is computed locally by diffing
 * against the last-known state for each id.
 *
 * Flags:
 *   --unresolved      only emit events for annotations the agent should
 *                     act on (open creates/updates, plus resolves/deletes
 *                     for previously-seen open ones — never silence a
 *                     transition the agent might still be working on).
 *   --once            print current unresolved snapshot, then exit.
 *   --until-empty     exit 0 when no open annotations remain.
 *   --idle <dur>      exit 0 if no event arrives in <dur> (e.g. 30s, 5m).
 *   --doc <path>      session selection, same as other commands.
 */
import { resolveSession } from "./_session-registry";
import type { Annotation, WsMessage } from "@/shared/types";

type Event =
  | { event: "create"; annotation: Annotation }
  | { event: "update"; annotation: Annotation }
  | { event: "resolve"; annotation: Annotation }
  | { event: "delete"; id: string }
  | { event: "snapshot-end" };

export async function watch(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const onlyUnresolved = args.includes("--unresolved");
  const once = args.includes("--once");
  const untilEmpty = args.includes("--until-empty");
  const idleMs = parseIdle(flagValue(args, "--idle"));
  const docFlag = flagValue(args, "--doc");

  const sess = await resolveSession(docFlag);
  const wsUrl = `ws://localhost:${sess.port}/_scribble/ws`;

  // State: id → last-seen annotation. Used to classify upserts.
  const state = new Map<string, Annotation>();

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleMs == null) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      process.exit(0);
    }, idleMs);
  };

  const emit = (ev: Event) => {
    process.stdout.write(JSON.stringify(ev) + "\n");
    resetIdleTimer();
  };

  // Decide whether an open annotation should be emitted under --unresolved.
  // Always emit resolve/delete events for ids we've previously surfaced —
  // the agent might still be working on them and needs to know to stop.
  const shouldEmitOpen = (ann: Annotation) => !onlyUnresolved || ann.status === "open";

  const checkUntilEmpty = () => {
    if (!untilEmpty) return;
    const stillOpen = [...state.values()].some((a) => a.status === "open");
    if (!stillOpen) process.exit(0);
  };

  // Bun's global WebSocket is browser-compatible.
  const ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => {
    resetIdleTimer();
  });

  ws.addEventListener("error", () => {
    console.error(`scribble watch: failed to connect to ${wsUrl}`);
    process.exit(1);
  });

  ws.addEventListener("close", (ev) => {
    // Clean exit (1000) only if we initiated it; otherwise the daemon died.
    if (ev.code === 1000) process.exit(0);
    console.error(`scribble watch: connection closed (code ${ev.code})`);
    process.exit(2);
  });

  ws.addEventListener("message", (msg) => {
    let parsed: WsMessage;
    try {
      parsed = JSON.parse(String(msg.data)) as WsMessage;
    } catch {
      return;
    }

    if (parsed.type === "snapshot") {
      for (const ann of parsed.annotations) {
        state.set(ann.id, ann);
        if (shouldEmitOpen(ann)) emit({ event: "create", annotation: ann });
      }
      emit({ event: "snapshot-end" });
      checkUntilEmpty();
      if (once) {
        ws.close(1000);
        process.exit(0);
      }
      return;
    }

    if (parsed.type === "upsert") {
      const next = parsed.annotation;
      const prev = state.get(next.id);
      state.set(next.id, next);

      if (!prev) {
        if (shouldEmitOpen(next)) emit({ event: "create", annotation: next });
      } else if (prev.status === "open" && next.status === "resolved") {
        emit({ event: "resolve", annotation: next });
      } else {
        // Body / replies changed, or reopened, or reply added after resolve.
        // Treat as update; agents that care about reopens can compare prev.
        if (!onlyUnresolved || next.status === "open" || prev.status === "open") {
          emit({ event: "update", annotation: next });
        }
      }
      checkUntilEmpty();
      return;
    }

    if (parsed.type === "remove") {
      const prev = state.get(parsed.id);
      state.delete(parsed.id);
      // Only surface deletes for ids we previously surfaced; otherwise the
      // agent never knew about them in the first place.
      if (!onlyUnresolved || (prev && prev.status === "open")) {
        emit({ event: "delete", id: parsed.id });
      }
      checkUntilEmpty();
      return;
    }

    // doc-changed: not an annotation event; ignore.
  });

  // Keep the process alive — the event loop will run until exit() or close.
  await new Promise(() => {});
}

function printHelp() {
  console.log(`scribble watch — stream annotation events as NDJSON.

USAGE
  scribble watch [--unresolved] [--once] [--until-empty] [--idle <dur>] [--doc <path>]

EVENTS  (one JSON object per line)
  {"event":"create",  "annotation":{...}}
  {"event":"update",  "annotation":{...}}
  {"event":"resolve", "annotation":{...}}
  {"event":"delete",  "id":"ann_..."}
  {"event":"snapshot-end"}            after the initial snapshot

FLAGS
  --unresolved        only emit events for open annotations (and the
                      resolve/delete events that close them)
  --once              print current snapshot, then exit 0
  --until-empty       exit 0 when no open annotations remain
  --idle <dur>        exit 0 after <dur> of silence (e.g. 30s, 5m, 1h)
  --doc <path>        select a session by document path`);
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function parseIdle(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+)(s|m|h)?$/);
  if (!m) throw new Error(`Invalid --idle value: ${raw} (try 30s, 5m, 1h)`);
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  const mult = unit === "h" ? 3600_000 : unit === "m" ? 60_000 : 1_000;
  return n * mult;
}
