#!/bin/bash
# Repro using actual CLI subprocesses, the way a human + shell hit it.
#   ./scratch/cli-repro.sh [N]
set -euo pipefail

N=${1:-30}
cd "$(dirname "$0")/.."

stale=0
fresh=0

for i in $(seq 1 "$N"); do
  # Create
  CREATED=$(curl -s -X POST http://localhost:7878/_scribble/api/annotations \
    -H 'content-type: application/json' \
    -d "{\"target\":{\"source\":\"/\",\"selector\":[{\"type\":\"TextQuoteSelector\",\"exact\":\"cli-repro-$i\"}]},\"body\":{\"type\":\"TextualBody\",\"value\":\"iter $i\"},\"author\":\"human\"}")
  ID=$(echo "$CREATED" | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')

  # Resolve via CLI (separate subprocess, the way a human uses it)
  bun src/cli.ts resolve "$ID" --reply "r$i" > /dev/null

  # List via CLI (also separate subprocess)
  STATUS=$(bun src/cli.ts list --json | bun -e "
    const all = JSON.parse(await Bun.stdin.text());
    const a = all.find(x => x.id === '$ID');
    console.log(a ? a.status : 'missing');
  ")

  if [ "$STATUS" = "resolved" ]; then
    fresh=$((fresh + 1))
  else
    stale=$((stale + 1))
    echo "[$i] STALE: got '$STATUS' for $ID" >&2
  fi
done

echo
echo "fresh: $fresh"
echo "stale: $stale"
