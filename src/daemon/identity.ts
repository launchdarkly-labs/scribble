/**
 * Resolve the local human's identity for use as the `author` on annotations
 * created from the overlay. Strategy:
 *
 *   1. SCRIBBLE_USER env var (explicit override)
 *   2. `git -C <docDir> config user.name` (and user.email)
 *   3. $USER env var
 *   4. "unknown" — should never hit; means we're in a very unusual env
 *
 * Resolved once at daemon startup against the doc's containing directory,
 * so a spec in repo A annotated by someone running scribble from repo B
 * still attributes to A's git identity.
 */
import { dirname } from "node:path";
import type { Author } from "@/shared/types";

export function resolveHumanAuthor(docPath: string): Author {
  const fromEnv = process.env.SCRIBBLE_USER?.trim();
  if (fromEnv) return { kind: "human", name: fromEnv };

  const docDir = dirname(docPath);
  const name = gitConfig(docDir, "user.name");
  if (name) {
    const email = gitConfig(docDir, "user.email");
    return { kind: "human", name, ...(email ? { email } : {}) };
  }

  const fromUser = process.env.USER?.trim();
  if (fromUser) return { kind: "human", name: fromUser };

  return { kind: "human", name: "unknown" };
}

function gitConfig(cwd: string, key: string): string | undefined {
  try {
    const proc = Bun.spawnSync(["git", "-C", cwd, "config", "--get", key], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (proc.exitCode !== 0) return undefined;
    const out = proc.stdout.toString().trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
