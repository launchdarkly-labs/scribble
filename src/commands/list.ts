import { resolveSession } from "./_session-registry";
import type { Annotation } from "@/shared/types";

export async function list(args: string[]) {
  const onlyUnresolved = args.includes("--unresolved");
  const asJson = args.includes("--json");
  const docFlag = flagValue(args, "--doc");

  const sess = await resolveSession(docFlag);
  const res = await fetch(`http://localhost:${sess.port}/_scribble/api/annotations`);
  if (!res.ok) throw new Error(`Daemon error: ${res.status} ${res.statusText}`);
  let annotations = (await res.json()) as Annotation[];
  if (onlyUnresolved) annotations = annotations.filter((a) => a.status === "open");

  if (asJson) {
    console.log(JSON.stringify(annotations, null, 2));
    return;
  }
  if (annotations.length === 0) {
    console.log("(no annotations)");
    return;
  }
  for (const a of annotations) {
    const quote = a.target.selector.find((s) => s.type === "TextQuoteSelector");
    const exact = quote && "exact" in quote ? quote.exact : "";
    console.log(`${a.status === "open" ? "○" : "●"} ${a.id}  [${a.author}]`);
    if (exact) console.log(`  ❝ ${truncate(exact, 80)}`);
    console.log(`  ${truncate(a.body.value, 120)}`);
    if (a.replies.length) {
      for (const r of a.replies) {
        console.log(`    ↳ [${r.author}] ${truncate(r.body, 100)}`);
      }
    }
    console.log("");
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
