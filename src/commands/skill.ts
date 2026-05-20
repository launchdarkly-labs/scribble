/**
 * `scribble skill` — print the agent-facing skill markdown to stdout, or
 * `--path` to print just its absolute path. Decouples the file's location
 * from how users get it into their agent context.
 *
 * The skill lives at src/skill/SKILL.md and is resolved relative to this
 * source file. In dev / `bun link` installs this resolves into the repo;
 * for a future compiled binary, build.ts will need to bundle the file
 * alongside the binary (tracked in TODO).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SKILL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "skill",
  "SKILL.md",
);

export async function skill(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`scribble skill — print the agent-facing skill markdown.

USAGE
  scribble skill                  Print the skill to stdout
  scribble skill --path           Print the absolute path of the skill file
  scribble skill | pbcopy         Copy to clipboard (macOS)
  scribble skill --path | xargs cat   Same as above, the long way`);
    return;
  }

  if (args.includes("--path")) {
    console.log(SKILL_PATH);
    return;
  }

  const file = Bun.file(SKILL_PATH);
  if (!(await file.exists())) {
    throw new Error(
      `Skill file not found at ${SKILL_PATH}. ` +
        `If you installed via 'bun link', try 'git pull' in the scribble repo.`,
    );
  }
  process.stdout.write(await file.text());
}
