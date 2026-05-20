/**
 * Daemon: serves the user's HTML document with the Scribble overlay injected,
 * exposes a JSON HTTP API for annotations, and broadcasts changes over WS.
 *
 * In dev (`bun run dev`), we build the overlay on demand via `Bun.build()`.
 * In a compiled binary, the built overlay will be embedded — wired up later.
 */
import { resolve, isAbsolute, dirname, basename, join } from "node:path";
import { watch as fsWatch } from "node:fs";
import { ulid } from "ulid";
import { Annotation, Author, type WsMessage } from "@/shared/types";
import { z } from "zod";
import * as store from "./store";
import { findInDoc } from "./anchoring";
import { resolveHumanAuthor } from "./identity";
import { renderMarkdown, isMarkdownPath, extractTitle } from "./markdown";
import { buildMarkdownShell } from "./markdown-shell";

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

/**
 * Aggressive cache prevention for daemon-served resources. `no-store`
 * alone is *usually* enough, but Chrome's in-memory module cache for
 * `<script type="module">` can satisfy imports from a stable URL without
 * a network round-trip on soft refresh, defeating it. Combining no-store
 * with no-cache + must-revalidate + the legacy Pragma/Expires pair is the
 * belt-and-suspenders configuration; for the JS bundle we *also* rotate
 * the URL via a `?v=N` query each rebuild.
 */
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

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

  // Two browser-facing bundles: the overlay (React, runs in the closed
  // shadow root) and the markdown runtime (vanilla, runs on the host page).
  // Each bundle owns a URL namespace under /_scribble/assets/<ns>/...,
  // which makes collisions across bundles structurally impossible — their
  // output basenames don't have to be globally unique because they live in
  // disjoint URL spaces. Rebuilt on every doc reload in dev.
  type Bundle = {
    /** URL path → served content (e.g. "/_scribble/assets/overlay/main.js"). */
    files: Map<string, { content: ArrayBuffer; type: string }>;
    /** Full URL of the entry-point script. */
    entryUrl: string;
  };
  type Bundles = { overlay: Bundle; mdRuntime: Bundle };

  async function buildOneBundle(
    srcRelative: string,
    namespace: string,
  ): Promise<Bundle> {
    const result = await Bun.build({
      entrypoints: [new URL(srcRelative, import.meta.url).pathname],
      target: "browser",
      format: "esm",
      minify: false,
      sourcemap: "inline",
      loader: { ".css": "text" },
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error(`Bundle build failed: ${namespace}`);
    }
    const files = new Map<string, { content: ArrayBuffer; type: string }>();
    let entryUrl = "";
    for (const out of result.outputs) {
      const basename = out.path.replace(/^.*[\\/]/, "");
      const url = `/_scribble/assets/${namespace}/${basename}`;
      const type =
        out.kind === "entry-point" || out.kind === "chunk"
          ? "application/javascript; charset=utf-8"
          : out.path.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
      files.set(url, { content: await out.arrayBuffer(), type });
      if (out.kind === "entry-point") entryUrl = url;
    }
    return { files, entryUrl };
  }

  async function buildBundles(): Promise<Bundles> {
    const [overlay, mdRuntime] = await Promise.all([
      buildOneBundle("../overlay/main.tsx", "overlay"),
      buildOneBundle("../markdown-runtime/runtime.ts", "runtime"),
    ]);
    return { overlay, mdRuntime };
  }

  let bundles: Bundles = await buildBundles();
  // Monotonic build counter. Appended to the entry script URL as `?v=N` so
  // each rebuild produces a byte-distinct URL in the HTML, which is the
  // only reliable way to bypass Chrome's in-memory ES-module cache for
  // <script type="module"> on a soft refresh. (Cache-Control: no-store on
  // the asset response isn't sufficient on its own — the browser can
  // satisfy the import from its module map before it talks to us.)
  let buildVersion = 1;

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

      // Browser bundles. Each bundle owns a namespace under /_scribble/assets/;
      // disjoint namespaces mean a lookup in one bundle can never resolve into
      // another's outputs. Lookup is by pathname only — any `?v=N` cache-
      // buster on the URL is ignored here.
      if (url.pathname.startsWith("/_scribble/assets/")) {
        const asset =
          bundles.overlay.files.get(url.pathname) ??
          bundles.mdRuntime.files.get(url.pathname);
        if (!asset) return new Response("Not found", { status: 404 });
        return new Response(asset.content, {
          headers: {
            "Content-Type": asset.type,
            ...NO_CACHE_HEADERS,
            "X-Scribble-Build": String(buildVersion),
          },
        });
      }

      // Markdown vendor assets: highlight.js theme + katex CSS/fonts.
      // Served straight out of node_modules; not bundled because (a) the
      // katex CSS references font files by relative URL and we want them
      // to resolve cleanly, and (b) it keeps the overlay bundle small.
      if (url.pathname.startsWith("/_scribble/md/")) {
        return serveMarkdownAsset(url.pathname.replace("/_scribble/md/", ""));
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
          bundles = await buildBundles();
          buildVersion += 1;
        } catch (err) {
          console.error(
            `[scribble] bundle rebuild failed, serving previous: ${(err as Error).message}`,
          );
        }
        const original = await Bun.file(docPath).text();
        let html: string;
        if (isMarkdownPath(docPath)) {
          const rendered = renderMarkdown(original);
          html = buildMarkdownShell({
            title: extractTitle(original, basename(docPath)),
            rendered,
            // Only inject the runtime <script> if there are diagrams to
            // render. The bundle itself is always built; this just avoids
            // having the browser fetch+parse it when it would do nothing.
            mdRuntimeEntryUrl: rendered.hasMermaid ? bundles.mdRuntime.entryUrl : null,
          });
        } else {
          html = original;
        }
        const entryUrlWithVersion = `${bundles.overlay.entryUrl}?v=${buildVersion}`;
        const injected = injectOverlay(html, entryUrlWithVersion, humanAuthor);
        return new Response(injected, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...NO_CACHE_HEADERS,
            "X-Scribble-Build": String(buildVersion),
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
    const source = await Bun.file(docPath).text();
    const found = findInDoc(source, body.quote, body.prefix, body.suffix, docPath);
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

/**
 * Serve highlight.js + katex assets out of node_modules. We use a fixed,
 * sandboxed prefix and an allowlist of resolvable subpaths to avoid any
 * path-traversal risk (`..` segments are rejected by `join` + the prefix
 * check below).
 */
async function serveMarkdownAsset(subpath: string): Promise<Response> {
  // Allowlist: hljs theme, katex CSS, katex fonts.
  let fsPath: string | null = null;
  if (subpath === "hljs.css") {
    fsPath = require.resolve("highlight.js/styles/github.min.css");
  } else if (subpath === "hljs-dark.css") {
    fsPath = require.resolve("highlight.js/styles/github-dark.min.css");
  } else if (subpath === "katex/katex.min.css") {
    fsPath = require.resolve("katex/dist/katex.min.css");
  } else if (subpath.startsWith("katex/fonts/")) {
    const fontFile = subpath.replace("katex/fonts/", "");
    if (/^KaTeX_[A-Za-z0-9_-]+\.(woff2?|ttf)$/.test(fontFile)) {
      const katexCss = require.resolve("katex/dist/katex.min.css");
      fsPath = join(dirname(katexCss), "fonts", fontFile);
    }
  }
  if (!fsPath) return new Response("Not found", { status: 404 });
  const file = Bun.file(fsPath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const type = fsPath.endsWith(".css")
    ? "text/css; charset=utf-8"
    : fsPath.endsWith(".woff2")
      ? "font/woff2"
      : fsPath.endsWith(".woff")
        ? "font/woff"
        : fsPath.endsWith(".ttf")
          ? "font/ttf"
          : "application/octet-stream";
  return new Response(file, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
  });
}

function injectOverlay(html: string, entryUrl: string, humanAuthor: Author): string {
  const safeAuthor = JSON.stringify(humanAuthor)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const head = `<meta name="scribble-user" content="${safeAuthor}">`;
  const snippet = `
<!-- scribble overlay -->
<div id="scribble-root"></div>
<script type="module" src="${entryUrl}"></script>
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
