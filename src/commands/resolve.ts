import { resolveSession } from "./_session-registry";

export async function resolve(args: string[]) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) throw new Error("Usage: scribble resolve <id> --reply \"...\" [--doc <path>]");
  const reply = flagValue(args, "--reply");
  const docFlag = flagValue(args, "--doc");
  const sess = await resolveSession(docFlag);

  const body: Record<string, unknown> = { status: "resolved" };
  if (reply) body.reply = { author: "agent", body: reply };

  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) throw new Error(`No annotation ${id}`);
  if (!res.ok) throw new Error(`Daemon error: ${res.status} ${await res.text()}`);
  console.log(`✓ resolved ${id}`);
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
