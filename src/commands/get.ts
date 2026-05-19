import { resolveSession } from "./_session-registry";

export async function get(args: string[]) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) throw new Error("Usage: scribble get <id> [--doc <path>]");
  const docFlag = flagValue(args, "--doc");
  const sess = await resolveSession(docFlag);
  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations/${id}`);
  if (res.status === 404) throw new Error(`No annotation ${id}`);
  if (!res.ok) throw new Error(`Daemon error: ${res.status}`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
