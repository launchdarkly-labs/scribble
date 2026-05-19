/**
 * Read-after-write reproduction harness.
 *
 *   bun scratch/raw-repro.ts <port>
 *
 * For N iterations:
 *   1. POST a fresh annotation (status: "open")
 *   2. PATCH it to status: "resolved" with a reply
 *   3. GET /api/annotations and look for that annotation
 *   4. Record whether the GET reflects the PATCH
 */
const port = Number(process.argv[2] ?? "7878");
const base = `http://localhost:${port}/_scribble/api/annotations`;
const N = Number(process.argv[3] ?? "50");

let stale = 0;
let fresh = 0;
let missing = 0;

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  // 1. Create
  const created = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: {
        source: "/",
        selector: [{ type: "TextQuoteSelector", exact: `repro-${i}` }],
      },
      body: { type: "TextualBody", value: `iteration ${i}` },
      author: "human",
    }),
  }).then((r) => r.json());

  // 2. Patch
  const patched = await fetch(`${base}/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "resolved",
      reply: { author: "agent", body: `r${i}` },
    }),
  }).then((r) => r.json());

  if (patched.status !== "resolved") {
    console.error(`[${i}] PATCH response was ${patched.status} — server bug`);
  }

  // 3. Read
  const all = (await fetch(base).then((r) => r.json())) as Array<{
    id: string;
    status: string;
  }>;
  const found = all.find((a) => a.id === created.id);

  if (!found) {
    missing++;
    console.error(`[${i}] missing from GET`);
  } else if (found.status === "open") {
    stale++;
    console.error(`[${i}] STALE: got open after patch resolved`);
  } else {
    fresh++;
  }
}
const ms = Date.now() - t0;

console.log(`\n${N} iterations in ${ms}ms (${(ms / N).toFixed(1)}ms/iter)`);
console.log(`  fresh:   ${fresh}`);
console.log(`  stale:   ${stale}`);
console.log(`  missing: ${missing}`);
