#!/usr/bin/env bun
/**
 * scribble CLI entrypoint.
 *
 * Subcommands hit a running daemon over HTTP. `open` starts one.
 * Session selection is by --doc <path> (resolves to absolute path).
 */
import { open } from "./commands/open";
import { list } from "./commands/list";
import { get } from "./commands/get";
import { resolve as resolveCmd } from "./commands/resolve";
import { session } from "./commands/session";
import { comment } from "./commands/comment";

const argv = process.argv.slice(2);
const [cmd, ...rest] = argv;

async function main() {
  switch (cmd) {
    case "open":
      return open(rest);
    case "list":
      return list(rest);
    case "get":
      return get(rest);
    case "resolve":
      return resolveCmd(rest);
    case "comment":
      return comment(rest);
    case "session":
      return session(rest);
    case "--version":
    case "-v":
      console.log("scribble 0.0.1");
      return;
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`scribble — local annotation layer for HTML documents.

USAGE
  scribble <command> [options]

START A SESSION
  open <file.html>              Start the daemon for this doc and open a browser
    --detach                    Run the daemon in the background; print {id, url, ...}
    --no-open                   Don't auto-launch a browser tab
    --port=N                    Listen on port N (default: 7878, then walks up)

READ / WRITE
  list [--unresolved] [--json]                 List annotations on the active doc
  get <id>                                     Show one annotation
  resolve <id> --reply "..."                   Close an annotation with a reply
  resolve apply --stdin                        Batch from JSON stdin (see SKILL.md)
  comment add --quote "..." --summary "..."    Pin an agent question to a span
    --prefix "..." --suffix "..."              Disambiguate when the quote isn't unique

SESSIONS
  session list [--json]         List active daemon sessions

GLOBAL
  --doc <path>                  Select session by document path
                                (auto-resolves to a session under cwd when ambiguous)
  --json                        Machine-readable output where supported
  -h, --help                    Show help
  -v, --version                 Show version

AGENTS
  Skill file at src/skill/SKILL.md (in this repo) teaches the workflow.
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
