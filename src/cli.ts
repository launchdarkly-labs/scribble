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
  console.log(`scribble — local-first HTML annotation for human/agent collaboration

USAGE
  scribble <command> [options]

COMMANDS
  open <file.html>              Start the daemon and open the doc in a browser
  list [--unresolved] [--json]  List annotations on the active doc
  get <id> [--doc <path>]       Show one annotation
  resolve <id> --reply "..."    Resolve an annotation with an optional reply
  session list [--json]         List active daemon sessions

GLOBAL
  --doc <path>                  Select session by document path
  --json                        Output JSON
  -h, --help                    Show help
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
