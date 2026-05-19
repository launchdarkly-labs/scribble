import { listSessions } from "./_session-registry";

export async function session(args: string[]) {
  const [sub, ...rest] = args;
  if (sub === "list") return sessionList(rest);
  throw new Error("Usage: scribble session list [--json]");
}

async function sessionList(args: string[]) {
  const asJson = args.includes("--json");
  const sessions = await listSessions();
  if (asJson) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (sessions.length === 0) {
    console.log("(no active sessions)");
    return;
  }
  for (const s of sessions) {
    console.log(`${s.id}  pid ${s.pid}  :${s.port}`);
    console.log(`  ${s.docPath}`);
    console.log(`  started ${s.started}`);
    console.log("");
  }
}
