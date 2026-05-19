/**
 * Daemon: serves the user's HTML document with the Scribble overlay injected,
 * exposes a JSON HTTP API for annotations, and broadcasts changes over WS.
 *
 * In dev (`bun run dev`), we build the overlay on demand via `Bun.build()`.
 * In a compiled binary, the built overlay will be embedded — wired up later.
 */
import { resolve, isAbsolute, dirname, basename } from "node:path";
import { watch as fsWatch } from "node:fs";
import { ulid } from "ulid";
import { Annotation, Author, type WsMessage } from "@/shared/types";
import { z } from "zod";
import * as store from "./store";
import { findInDoc } from "./anchoring";
import { resolveHumanAuthor } from "./identity";

const CreateBody = Annotation.omit({
  id: true,
  status: true,
  replies: true,
  created: true,
  updated: true,
}).extend({
  // Allow optional client-suggested fields too
});

const PatchBody = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  reply: z
    .object({
      author: Author,
      body: z.string(),
    })
    .optional(),
});

const RemoveReply = z.object({
  replyIndex: z.number().int().nonnegative(),
});

const ByQuoteBody = z.object({
  quote: z.string().min(1),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  summary: z.string().min(1),
  author: Author.default({ kind: "agent" }),
});

const BatchItem = z
  .object({
    id: z.string(),
    status: z.enum(["open", "resolved"]).optional(),
    reply: z
      .object({
        body: z.string().min(1),
        author: Author.default({ kind: "agent" }),
      })
      .optional(),
  })
  .refine((v) => v.status !== undefined || v.reply !== undefined, {
    message: "each batch item must set status, reply, or both",
  });

const BatchBody = z.object({
  items: z.array(BatchItem).min(1).max(200),
});

interface DaemonOptions {
  docPath: string;
  port: number;
}

export async function startDaemon(opts: DaemonOptions) {
  const docPath = isAbsolute(opts.docPath) ? opts.docPath : resolve(opts.docPath);
  const docFile = Bun.file(docPath);
  if (!(await docFile.exists())) {
    throw new Error(`Document not found: ${docPath}`);
  }

  // Resolve the local human's identity from git config (or env override)
  // once at startup; the overlay reads it from an injected <meta> tag.
  const humanAuthor = resolveHumanAuthor(docPath);

  // The overlay is rebuilt on every doc reload in dev so source edits show
  // up without restarting the daemon. The build typically takes <100ms and
  // its result is reused for asset requests until the next doc reload.
  type Overlay = {
    assets: Map<string, { content: ArrayBuffer; type: string }>;
    entry: string;
  };
  async function buildOverlay(): Promise<Overlay> {
    const result = await Bun.build({
      entrypoints: [new URL("../overlay/main.tsx", import.meta.url).pathname],
      target: "browser",
      format: "esm",
      minify: false,
      sourcemap: "inline",
      loader: { ".css": "text" },
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error("Overlay build failed");
    }
    const assets = new Map<string, { content: ArrayBuffer; type: string }>();
    for (const out of result.outputs) {
      const name = out.path.replace(/^.*[\\/]/, "");
      assets.set(name, {
        content: await out.arrayBuffer(),
        type:
          out.kind === "entry-point" || out.kind === "chunk"
            ? "application/javascript; charset=utf-8"
            : "text/css; charset=utf-8",
      });
    }
    const entry =
      result.outputs.find((o) => o.kind === "entry-point")?.path.replace(/^.*[\\/]/, "") ??
      "main.js";
    return { assets, entry };
  }

  let overlay: Overlay = await buildOverlay();

  // WebSocket clients
  const wsClients = new Set<Bun.ServerWebSocket<unknown>>();
  const broadcast = (msg: WsMessage) => {
    const payload = JSON.stringify(msg);
    for (const ws of wsClients) ws.send(payload);
  };

  // Watch the source doc for edits.
  //
  // We watch the *parent directory* and filter by basename, rather than
  // watching the file itself. This survives atomic-rename-on-save — the
  // pattern used by vim, VS Code, `sed -i`, `node:fs.writeFile`, and most
  // agent edit paths. fs.watch on the file follows the inode, which gets
  // orphaned by a rename; fs.watch on the directory tracks the name.
  //
  // Editors fire several events per save; debounce 150ms to coalesce.
  // On change, broadcast `doc-changed` — the browser reloads the page, the
  // overlay's locate() then re-anchors against the fresh DOM. Anything
  // locate() can't find becomes a (derived) orphan client-side. No
  // server-side orphan state is persisted.
  let docChangeTimer: ReturnType<typeof setTimeout> | null = null;
  const docDir = dirname(docPath);
  const docBase = basename(docPath);
  const docWatcher = fsWatch(docDir, (_event, filename) => {
    if (filename !== docBase) return;
    if (docChangeTimer) clearTimeout(docChangeTimer);
    docChangeTimer = setTimeout(() => {
      broadcast({ type: "doc-changed" });
    }, 150);
  });

  // Make sure we stop watching when the daemon exits.
  const cleanupWatcher = () => {
    if (docChangeTimer) clearTimeout(docChangeTimer);
    try {
      docWatcher.close();
    } catch {}
  };
  process.on("exit", cleanupWatcher);

  const server = Bun.serve({
    port: opts.port,
    async fetch(req, srv) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === "/_scribble/ws") {
        if (srv.upgrade(req)) return;
        return new Response("Upgrade failed", { status: 400 });
      }

      // Overlay assets
      if (url.pathname.startsWith("/_scribble/assets/")) {
        const name = url.pathname.replace("/_scribble/assets/", "");
        const asset = overlay.assets.get(name);
        if (!asset) return new Response("Not found", { status: 404 });
        return new Response(asset.content, {
          headers: {
            "Content-Type": asset.type,
            "Cache-Control": "no-store",
          },
        });
      }

      // JSON API
      if (url.pathname.startsWith("/_scribble/api/")) {
        return handleApi(req, url, docPath, broadcast);
      }

      // The document, with overlay injected. Rebuild the overlay first so
      // source edits are picked up without restarting the daemon. On build
      // error we keep serving the previous successful build.
      if (url.pathname === "/" || url.pathname === "/index.html") {
        try {
          overlay = await buildOverlay();
        } catch (err) {
          console.error(
            `[scribble] overlay rebuild failed, serving previous: ${(err as Error).message}`,
          );
        }
        const original = await Bun.file(docPath).text();
        const injected = injectOverlay(original, overlay.entry, humanAuthor);
        return new Response(injected, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        wsClients.add(ws);
        // Send initial snapshot
        store.readAll(docPath).then((annotations) => {
          ws.send(JSON.stringify({ type: "snapshot", annotations } satisfies WsMessage));
        });
      },
      close(ws) {
        wsClients.delete(ws);
      },
      message() {
        // No client→server messages yet; mutations go through HTTP.
      },
    },
  });

  return server;
}

async function handleApi(
  req: Request,
  url: URL,
  docPath: string,
  broadcast: (msg: WsMessage) => void,
): Promise<Response> {
  // ── Create-by-quote (agent-initiated, Flow C) ──
  if (req.method === "POST" && url.pathname === "/_scribble/api/annotations/by-quote") {
    const body = ByQuoteBody.parse(await req.json());
    const html = await Bun.file(docPath).text();
    const found = findInDoc(html, body.quote, body.prefix, body.suffix);
    if (!found.ok) return new Response(found.error, { status: 400 });
    const now = new Date().toISOString();
    const ann: Annotation = {
      id: `ann_${ulid()}`,
      target: {
        source: docPath,
        selector: [
          {
            type: "TextQuoteSelector",
            exact: found.exact,
            prefix: found.prefix,
            suffix: found.suffix,
          },
        ],
      },
      body: { type: "TextualBody", value: body.summary },
      author: body.author,
      status: "open",
      replies: [],
      created: now,
      updated: now,
    };
    await store.append(docPath, ann);
    broadcast({ type: "upsert", annotation: ann });
    return Response.json(ann, { status: 201 });
  }

  // ── Batch apply (agent batch resolve / reply) ──
  if (req.method === "POST" && url.pathname === "/_scribble/api/annotations/batch") {
    const body = BatchBody.parse(await req.json());
    const updated: Annotation[] = [];
    const notFound: string[] = [];
    for (const item of body.items) {
      const next = await store.update(docPath, item.id, (prev) => ({
        ...prev,
        status: item.status ?? prev.status,
        replies: item.reply
          ? [
              ...prev.replies,
              { author: item.reply.author, body: item.reply.body, created: new Date().toISOString() },
            ]
          : prev.replies,
        updated: new Date().toISOString(),
      }));
      if (next) {
        broadcast({ type: "upsert", annotation: next });
        updated.push(next);
      } else {
        notFound.push(item.id);
      }
    }
    return Response.json({ updated: updated.length, notFound, results: updated });
  }

  const m = url.pathname.match(/^\/_scribble\/api\/annotations(?:\/([^/]+))?$/);
  if (!m) return new Response("Not found", { status: 404 });
  const id = m[1];

  if (req.method === "GET" && !id) {
    const all = await store.readAll(docPath);
    return Response.json(all);
  }

  if (req.method === "GET" && id) {
    const all = await store.readAll(docPath);
    const ann = all.find((a) => a.id === id);
    return ann ? Response.json(ann) : new Response("Not found", { status: 404 });
  }

  if (req.method === "POST" && !id) {
    const body = CreateBody.parse(await req.json());
    const now = new Date().toISOString();
    const ann: Annotation = {
      id: `ann_${ulid()}`,
      target: body.target,
      body: body.body,
      author: body.author,
      status: "open",
      replies: [],
      created: now,
      updated: now,
    };
    await store.append(docPath, ann);
    broadcast({ type: "upsert", annotation: ann });
    return Response.json(ann, { status: 201 });
  }

  if (req.method === "DELETE" && id) {
    const updated = await store.update(docPath, id, (prev) => ({
      ...prev,
      status: "deleted",
      updated: new Date().toISOString(),
    }));
    if (!updated) return new Response("Not found", { status: 404 });
    broadcast({ type: "remove", id });
    return new Response(null, { status: 204 });
  }

  if (req.method === "PATCH" && id) {
    const patch = PatchBody.parse(await req.json());
    const updated = await store.update(docPath, id, (prev) => ({
      ...prev,
      status: patch.status ?? prev.status,
      replies: patch.reply
        ? [...prev.replies, { ...patch.reply, created: new Date().toISOString() }]
        : prev.replies,
      updated: new Date().toISOString(),
    }));
    if (!updated) return new Response("Not found", { status: 404 });
    broadcast({ type: "upsert", annotation: updated });
    return Response.json(updated);
  }

  return new Response("Method not allowed", { status: 405 });
}

function injectOverlay(html: string, entryName: string, humanAuthor: Author): string {
  const safeAuthor = JSON.stringify(humanAuthor)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const head = `<meta name="scribble-user" content="${safeAuthor}">`;
  const snippet = `
<!-- scribble overlay -->
<div id="scribble-root"></div>
<script type="module" src="/_scribble/assets/${entryName}"></script>
`;
  let out = html;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${head}\n</head>`);
  } else {
    out = head + out;
  }
  if (out.includes("</body>")) {
    out = out.replace("</body>", `${snippet}\n</body>`);
  } else {
    out = out + snippet;
  }
  return out;
}
