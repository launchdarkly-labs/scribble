/**
 * Cross-compile scribble into single-binary executables, one per platform.
 *
 * Usage:
 *   bun run build           # all targets
 *   bun run build darwin    # one
 */
import { mkdir, rm } from "node:fs/promises";

const ALL_TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
] as const;

type Target = (typeof ALL_TARGETS)[number];

const filter = process.argv[2];
const targets = filter
  ? ALL_TARGETS.filter((t) => t.includes(filter))
  : ALL_TARGETS;

if (targets.length === 0) {
  console.error(`No targets match "${filter}". Choose from:\n${ALL_TARGETS.join("\n")}`);
  process.exit(1);
}

const pkg = await Bun.file("./package.json").json();
const version = pkg.version ?? "0.0.0";

await rm("./dist", { recursive: true, force: true });
await mkdir("./dist", { recursive: true });

for (const target of targets) {
  const ext = target.includes("windows") ? ".exe" : "";
  const outfile = `./dist/scribble-${target.replace("bun-", "")}${ext}`;
  console.log(`→ ${outfile}`);
  const result = await Bun.build({
    entrypoints: ["./src/cli.ts"],
    compile: { target: target as Target, outfile },
    minify: true,
    sourcemap: "linked",
    bytecode: !target.includes("windows"), // bytecode is unstable on windows for some configs
    loader: { ".css": "text" },
    define: {
      "process.env.SCRIBBLE_VERSION": JSON.stringify(version),
    },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

console.log(`\n✓ built ${targets.length} target(s) into ./dist/`);
