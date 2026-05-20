import { resolve as resolvePath, isAbsolute } from "node:path";
import { ulid } from "ulid";
import { startDaemon } from "@/daemon/server";
import { listSessions, registerSession, unregisterSession } from "./_session-registry";

export async function open(args: string[]) {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: scribble open <file.html|file.md> [--detach] [--no-open] [--port=N]");
  if (args.includes("--detach")) return openDetached(args);
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

/**
 * `--detach`: spawn a child that runs the regular `open` flow, wait until
 * it registers a session, then print JSON about the session and exit. The
 * child outlives this process.
 *
 * The spawn command mirrors how we were invoked: in dev that's
 * `[bun, src/cli.ts, ...]`, in a compiled binary it's `[<binary>, ...]`.
 * We forward argv minus `--detach`, ensuring `--no-open` is set so the
 * detached daemon doesn't pop a browser tab the agent didn't ask for.
 */
async function openDetached(args: string[]) {
  const childArgs = process.argv.slice(1).filter((a) => a !== "--detach");
  if (!childArgs.includes("--no-open")) childArgs.push("--no-open");

  const child = Bun.spawn([process.execPath, ...childArgs], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    // detached:true puts the child in its own process group so it survives
    // when this parent exits; .unref() lets the parent exit immediately.
    detached: true,
  });
  child.unref?.();

  // Poll the session registry for our child's pid to appear.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const sessions = await listSessions();
    const match = sessions.find((s) => s.pid === child.pid);
    if (match) {
      console.log(
        JSON.stringify(
          {
            id: match.id,
            docPath: match.docPath,
            port: match.port,
            pid: match.pid,
            url: `http://localhost:${match.port}`,
          },
          null,
          2,
        ),
      );
      return;
    }
    await Bun.sleep(50);
  }
  // Timeout. Best-effort cleanup.
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {}
  throw new Error("Daemon spawned but did not register within 5s");
}


