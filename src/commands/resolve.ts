import { resolveSession } from "./_session-registry";
import { resolveAgentAuthor } from "./_identity";

export async function resolve(args: string[]) {
  // `scribble resolve apply --stdin` — batch
  if (args[0] === "apply") return resolveApply(args.slice(1));

  // `scribble resolve <id> --reply "..."` — single
  const id = args.find((a) => !a.startsWith("--"));
  if (!id)
    throw new Error('Usage: scribble resolve <id> --reply "..." [--doc <path>]  |  scribble resolve apply --stdin');
  const reply = flagValue(args, "--reply");
  const docFlag = flagValue(args, "--doc");
  const sess = await resolveSession(docFlag);

  const body: Record<string, unknown> = { status: "resolved" };
  if (reply) body.reply = { author: resolveAgentAuthor(sess.docPath), body: reply };

  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) throw new Error(`No annotation ${id}`);
  if (!res.ok) throw new Error(`Daemon error: ${res.status} ${await res.text()}`);
  console.log(`✓ resolved ${id}`);
}

/**
 * Batch:  `scribble resolve apply --stdin`
 *
 * Reads JSON from stdin. Two accepted shapes:
 *
 *   { "items": [ { "id": "...", "reply": "...", "status": "resolved" }, ... ] }
 *   [ { "id": "...", "reply": "..." }, ... ]
 *
 * Each item must have `id` and at least one of `reply` or `status`. Items
 * without an explicit `status` default to `resolved` if a reply is given,
 * else are sent as-is (reply-only patches).
 *
 * Default author for replies is `agent`. Override per-item with `author`.
 */
async function resolveApply(args: string[]) {
  if (!args.includes("--stdin")) {
    throw new Error("Usage: scribble resolve apply --stdin   (reads JSON batch from stdin)");
  }
  const docFlag = flagValue(args, "--doc");

  const raw = await readStdin();
  if (!raw.trim()) throw new Error("stdin was empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON on stdin: ${(e as Error).message}`);
  }

  type Item = { id: string; reply?: string; status?: "open" | "resolved"; author?: "human" | "agent" };
  const rawItems = Array.isArray(parsed)
    ? (parsed as Item[])
    : ((parsed as { items?: Item[] }).items ?? []);
  if (rawItems.length === 0) throw new Error("No items in batch");

  const sess = await resolveSession(docFlag);
  const agentAuthor = resolveAgentAuthor(sess.docPath);

  // Default: items with a reply and no status become 'resolved'.
  const items = rawItems.map((it) => {
    const status = it.status ?? (it.reply ? ("resolved" as const) : undefined);
    const reply = it.reply
      ? { body: it.reply, author: it.author ? { kind: "agent" as const, name: it.author } : agentAuthor }
      : undefined;
    return { id: it.id, status, reply };
  });
  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Daemon error: ${res.status} ${await res.text()}`);
  const result = (await res.json()) as { updated: number; notFound: string[] };
  console.log(`✓ updated ${result.updated} annotation(s)`);
  if (result.notFound.length > 0) {
    console.error(`✗ not found: ${result.notFound.join(", ")}`);
    process.exitCode = 1;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = Bun.stdin.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
