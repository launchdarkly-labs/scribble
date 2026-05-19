/**
 * Daemon: serves the user's HTML document with the Scribble overlay injected,
 * exposes a JSON HTTP API for annotations, and broadcasts changes over WS.
 *
 * In dev (`bun run dev`), we build the overlay on demand via `Bun.build()`.
 * In a compiled binary, the built overlay will be embedded — wired up later.
 */
import { resolve, isAbsolute } from "node:path";
import { ulid } from "ulid";
import { Annotation, type WsMessage } from "@/shared/types";
import { z } from "zod";
import * as store from "./store";

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
      author: z.enum(["human", "agent"]),
      body: z.string(),
    })
    .optional(),
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

  // Build the overlay bundle once on startup (dev path).
  const overlayBuild = await Bun.build({
    entrypoints: [new URL("../overlay/main.tsx", import.meta.url).pathname],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "inline",
    loader: { ".css": "text" },
  });
  if (!overlayBuild.success) {
    for (const log of overlayBuild.logs) console.error(log);
    throw new Error("Overlay build failed");
  }
  const overlayAssets = new Map<string, { content: ArrayBuffer; type: string }>();
  for (const out of overlayBuild.outputs) {
    const name = out.path.replace(/^.*[\\/]/, "");
    overlayAssets.set(name, {
      content: await out.arrayBuffer(),
      type:
        out.kind === "entry-point" || out.kind === "chunk"
          ? "application/javascript; charset=utf-8"
          : "text/css; charset=utf-8",
    });
  }
  const overlayEntry =
    overlayBuild.outputs.find((o) => o.kind === "entry-point")?.path.replace(/^.*[\\/]/, "") ?? "main.js";

  // WebSocket clients
  const wsClients = new Set<Bun.ServerWebSocket<unknown>>();
  const broadcast = (msg: WsMessage) => {
    const payload = JSON.stringify(msg);
    for (const ws of wsClients) ws.send(payload);
  };

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
        const asset = overlayAssets.get(name);
        if (!asset) return new Response("Not found", { status: 404 });
        return new Response(asset.content, {
          headers: { "Content-Type": asset.type },
        });
      }

      // JSON API
      if (url.pathname.startsWith("/_scribble/api/")) {
        return handleApi(req, url, docPath, broadcast);
      }

      // The document, with overlay injected
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const original = await docFile.text();
        const injected = injectOverlay(original, overlayEntry);
        return new Response(injected, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
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

function injectOverlay(html: string, entryName: string): string {
  const snippet = `
<!-- scribble overlay -->
<div id="scribble-root"></div>
<script type="module" src="/_scribble/assets/${entryName}"></script>
`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}\n</body>`);
  }
  return html + snippet;
}
