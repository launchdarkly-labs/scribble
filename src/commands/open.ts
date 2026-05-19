import { resolve as resolvePath, isAbsolute } from "node:path";
import { ulid } from "ulid";
import { startDaemon } from "@/daemon/server";
import { registerSession, unregisterSession } from "./_session-registry";

export async function open(args: string[]) {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: scribble open <file.html>");
  const noOpen = args.includes("--no-open");
  const portFlag = args.find((a) => a.startsWith("--port="));
  const port = portFlag ? Number(portFlag.split("=")[1]) : await pickPort();

  const docPath = isAbsolute(file) ? file : resolvePath(file);
  const id = `sess_${ulid()}`;

  const server = await startDaemon({ docPath, port });
  const livePort = server.port ?? port;
  await registerSession({
    id,
    docPath,
    port: livePort,
    pid: process.pid,
    started: new Date().toISOString(),
  });

  const url = `http://localhost:${livePort}`;
  console.log(`scribble · ${docPath}`);
  console.log(`         ${url}`);
  console.log(`         session ${id} · pid ${process.pid}`);
  console.log(`         press ctrl-c to stop`);

  if (!noOpen) openBrowser(url);

  const shutdown = async () => {
    await unregisterSession(id);
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

async function pickPort(): Promise<number> {
  // Prefer 7878 ("STST" on a phone keypad, ish) then walk up.
  for (let p = 7878; p < 7900; p++) {
    if (await isPortFree(p)) return p;
  }
  return 0; // let Bun pick
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const s = Bun.serve({ port, fetch: () => new Response("") });
    s.stop();
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? ["open", url] : platform === "win32" ? ["cmd", "/c", "start", url] : ["xdg-open", url];
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
}
