/**
 * Identity helpers used by CLI subcommands that create annotations or
 * replies. The CLI is *agent territory* — every command that mutates
 * the store defaults `kind: "agent"`, with `name` from SCRIBBLE_AGENT
 * and `by` from SCRIBBLE_USER or the doc dir's git config.
 *
 * `--author human` (or `--as human`) flips it to a human-shaped author
 * if a real person is using the CLI directly.
 */
import { dirname } from "node:path";
import type { Author } from "@/shared/types";

export function resolveAgentAuthor(docPath: string): Author {
  const name = process.env.SCRIBBLE_AGENT?.trim() || "agent";
  const by =
    process.env.SCRIBBLE_USER?.trim() ||
    gitConfig(dirname(docPath), "user.name") ||
    process.env.USER?.trim();
  return { kind: "agent", name, ...(by ? { by } : {}) };
}

export function resolveHumanAuthorFromCli(docPath: string): Author {
  const fromEnv = process.env.SCRIBBLE_USER?.trim();
  if (fromEnv) return { kind: "human", name: fromEnv };
  const name = gitConfig(dirname(docPath), "user.name");
  if (name) {
    const email = gitConfig(dirname(docPath), "user.email");
    return { kind: "human", name, ...(email ? { email } : {}) };
  }
  const fromUser = process.env.USER?.trim();
  return { kind: "human", name: fromUser ?? "unknown" };
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
