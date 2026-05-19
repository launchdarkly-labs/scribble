import { resolveSession } from "./_session-registry";
import { resolveAgentAuthor, resolveHumanAuthorFromCli } from "./_identity";

export async function comment(args: string[]) {
  const [sub, ...rest] = args;
  if (sub === "add") return commentAdd(rest);
  throw new Error(
    `Usage: scribble comment add --quote "..." --summary "..." [--prefix "..."] [--suffix "..."] [--doc <path>]`,
  );
}

async function commentAdd(args: string[]) {
  const quote = flagValue(args, "--quote");
  const summary = flagValue(args, "--summary");
  const prefix = flagValue(args, "--prefix");
  const suffix = flagValue(args, "--suffix");
  const asFlag = flagValue(args, "--as") ?? flagValue(args, "--author");
  const docFlag = flagValue(args, "--doc");
  if (!quote) throw new Error("--quote required");
  if (!summary) throw new Error("--summary required");

  const sess = await resolveSession(docFlag);
  const author =
    asFlag === "human"
      ? resolveHumanAuthorFromCli(sess.docPath)
      : resolveAgentAuthor(sess.docPath);
  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations/by-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote, prefix, suffix, summary, author }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Daemon error: ${res.status} ${body}`);
  }
  const ann = (await res.json()) as { id: string };
  console.log(`✓ created ${ann.id}`);
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
