/**
 * Parallel writer/reader to expose any race in the append-then-read path.
 *
 *   bun scratch/parallel-repro.ts [N=200] [PARALLEL=8]
 *
 * Spawns PARALLEL workers. Each worker, in a loop, creates an annotation,
 * patches it to resolved, then GETs and verifies the patch is visible.
 */
const port = 7878;
const base = `http://localhost:${port}/_scribble/api/annotations`;
const N = Number(process.argv[2] ?? "200");
const PARALLEL = Number(process.argv[3] ?? "8");

let stale = 0;
let fresh = 0;
let missing = 0;
let lost = 0; // annotation completely vanished (raced-out append)

async function worker(id: number, n: number) {
  for (let i = 0; i < n; i++) {
    const tag = `p${id}-${i}`;
    const created = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { source: "/", selector: [{ type: "TextQuoteSelector", exact: tag }] },
        body: { type: "TextualBody", value: tag },
        author: "human",
      }),
    }).then((r) => r.json());

    await fetch(`${base}/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "resolved",
        reply: { author: "agent", body: tag },
      }),
    });

    const all = (await fetch(base).then((r) => r.json())) as Array<{
      id: string;
      status: string;
    }>;
    const found = all.find((a) => a.id === created.id);
    if (!found) missing++;
    else if (found.status === "open") stale++;
    else fresh++;
  }
}

const perWorker = Math.ceil(N / PARALLEL);
const t0 = Date.now();
await Promise.all(Array.from({ length: PARALLEL }, (_, i) => worker(i, perWorker)));
const ms = Date.now() - t0;

// Also check: did all annotations we created actually persist?
const finalAll = (await fetch(base).then((r) => r.json())) as Array<{ body: { value: string } }>;
const expected = PARALLEL * perWorker;
const actualOurs = finalAll.filter((a) => /^p\d+-\d+$/.test(a.body.value)).length;
lost = expected - actualOurs;

console.log(`\n${expected} ops across ${PARALLEL} workers in ${ms}ms (${(ms / expected).toFixed(2)}ms/op)`);
console.log(`  fresh:   ${fresh}`);
console.log(`  stale:   ${stale}`);
console.log(`  missing: ${missing}`);
console.log(`  lost on disk: ${lost} (post-test count: ${actualOurs}/${expected})`);
