/**
 * Tracks live daemon sessions so subsequent CLI invocations can find them.
 * Stored at ~/.scribble/sessions.json so it survives across terminals.
 *
 * Schema is intentionally tiny — sessions are ephemeral.
 */
import { homedir } from "node:os";
import { join, relative, resolve as resolvePath, isAbsolute } from "node:path";
import { mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";

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
 * Resolve a session, in order of preference:
 *
 *   1. --doc <path>           explicit match against the absolute docPath
 *   2. only one session live  trivially that one
 *   3. CWD heuristic          if exactly one session's docPath is under the
 *                             current working directory, use it
 *   4. otherwise              error and list the relevant candidates
 *
 * The CWD heuristic mirrors Hunk's `--repo .` behaviour: when an agent is
 * working in a project directory, the most likely scribble session is the
 * one annotating a doc in that project.
 */
export async function resolveSession(docFlag?: string): Promise<SessionRecord> {
  const sessions = await listSessions();
  if (sessions.length === 0) {
    throw new Error("No active scribble sessions. Start one with `scribble open <file.html>`.");
  }
  if (docFlag) {
    const abs = isAbsolute(docFlag) ? docFlag : resolvePath(docFlag);
    const match = sessions.find((s) => s.docPath === abs);
    if (!match) throw new Error(`No session matches --doc ${docFlag}`);
    return match;
  }
  if (sessions.length === 1) return sessions[0]!;

  // Canonicalize cwd so a symlinked path (e.g. /tmp → /private/tmp on macOS)
  // doesn't make us miss a perfectly good match.
  const cwd = realPathSafe(process.cwd());
  const underCwd = sessions.filter((s) => isUnder(realPathSafe(s.docPath), cwd));
  if (underCwd.length === 1) return underCwd[0]!;

  const candidates = underCwd.length > 0 ? underCwd : sessions;
  const hint =
    underCwd.length > 1
      ? `Multiple sessions match your current directory. Pick one with --doc <path>:`
      : `Multiple active sessions. Pick one with --doc <path>:`;
  throw new Error(
    `${hint}\n` + candidates.map((s) => `  ${s.docPath}`).join("\n"),
  );
}

/** Is `child` strictly under directory `parent`? */
function isUnder(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

/** realpath that falls back to the input if the file doesn't exist. */
function realPathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
