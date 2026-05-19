/**
 * Tracks live daemon sessions so subsequent CLI invocations can find them.
 * Stored at ~/.scribble/sessions.json so it survives across terminals.
 *
 * Schema is intentionally tiny — sessions are ephemeral.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export interface SessionRecord {
  id: string;
  docPath: string; // absolute
  port: number;
  pid: number;
  started: string;
}

const REGISTRY_DIR = join(homedir(), ".scribble");
const REGISTRY_PATH = join(REGISTRY_DIR, "sessions.json");

async function readRaw(): Promise<SessionRecord[]> {
  const file = Bun.file(REGISTRY_PATH);
  if (!(await file.exists())) return [];
  try {
    return JSON.parse(await file.text()) as SessionRecord[];
  } catch {
    return [];
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  const all = await readRaw();
  const alive = all.filter((s) => isAlive(s.pid));
  if (alive.length !== all.length) await writeAll(alive);
  return alive;
}

export async function registerSession(rec: SessionRecord): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true });
  const all = (await readRaw()).filter((s) => s.id !== rec.id && isAlive(s.pid));
  all.push(rec);
  await writeAll(all);
}

export async function unregisterSession(id: string): Promise<void> {
  const all = (await readRaw()).filter((s) => s.id !== id);
  await writeAll(all);
}

async function writeAll(sessions: SessionRecord[]): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true });
  await Bun.write(REGISTRY_PATH, JSON.stringify(sessions, null, 2));
}

/**
 * Resolve a session by --doc flag or auto-resolve when only one is live.
 */
export async function resolveSession(docFlag?: string): Promise<SessionRecord> {
  const sessions = await listSessions();
  if (sessions.length === 0) {
    throw new Error("No active scribble sessions. Start one with `scribble open <file.html>`.");
  }
  if (docFlag) {
    const { resolve, isAbsolute } = await import("node:path");
    const abs = isAbsolute(docFlag) ? docFlag : resolve(docFlag);
    const match = sessions.find((s) => s.docPath === abs);
    if (!match) throw new Error(`No session matches --doc ${docFlag}`);
    return match;
  }
  if (sessions.length > 1) {
    throw new Error(
      `Multiple active sessions. Pick one with --doc <path>:\n` +
        sessions.map((s) => `  ${s.docPath}`).join("\n"),
    );
  }
  return sessions[0]!;
}
