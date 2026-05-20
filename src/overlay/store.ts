/**
 * Overlay state: signals + websocket sync to the daemon.
 *
 * The daemon is the source of truth. Mutations go through HTTP, the daemon
 * persists + broadcasts, the WS handler updates signals. We do *not* do
 * optimistic updates in v0 — the round-trip on localhost is too fast for it
 * to matter and we avoid reconciliation bugs.
 */
import { signal, computed } from "@preact/signals-react";
import type { Annotation, Author, Selector, WsMessage } from "@/shared/types";

/**
 * The local human's identity, sourced from the <meta name="scribble-user">
 * tag the daemon injects (which it resolved from git config / env). Falls
 * back to a generic { kind: "human" } if the tag isn't there for some reason.
 */
export const humanAuthor: Author = readHumanAuthor();

function readHumanAuthor(): Author {
  if (typeof document === "undefined") return { kind: "human" };
  const meta = document.querySelector('meta[name="scribble-user"]');
  const raw = meta?.getAttribute("content");
  if (!raw) return { kind: "human" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === "human") {
      return parsed as Author;
    }
  } catch {}
  return { kind: "human" };
}

export const annotations = signal<Annotation[]>([]);
export const activeId = signal<string | null>(null);
export const hoverId = signal<string | null>(null);
export const draftRange = signal<Range | null>(null);
export const connected = signal(false);
/**
 * Guarded "show the thread card" flag, valued as the id it applies to.
 *
 * Set by the dialog coordinator (src/overlay/dialog-coordinator.ts) when
 * the IntersectionObserver reports that the active annotation's target
 * has reached the viewport's center band — i.e., the smooth scroll has
 * settled at the destination. ThreadCard renders iff this matches the
 * currently-active annotation's id.
 *
 * Stored as an id rather than a boolean so a mid-swap (click thread A,
 * then click thread B before A's card unmounts) doesn't flash A's card
 * under B's id: the equality check `showThreadForId === ann.id` is its
 * own guard.
 */
export const showThreadForId = signal<string | null>(null);
/** Set of annotation ids whose selector can no longer be located in the
 * current DOM. Populated by the highlight-sync effect as a side-product of
 * its locate() calls. "Orphan" is a derived view, never persisted. */
export const orphanedIds = signal<Set<string>>(new Set());

export const unresolved = computed(() =>
  annotations.value.filter((a) => a.status === "open"),
);

export const activeAnnotation = computed(() =>
  annotations.value.find((a) => a.id === activeId.value) ?? null,
);

function upsert(list: Annotation[], next: Annotation): Annotation[] {
  const i = list.findIndex((a) => a.id === next.id);
  if (i === -1) return [...list, next].sort((a, b) => a.created.localeCompare(b.created));
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

export function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/_scribble/ws`);
  ws.onopen = () => (connected.value = true);
  ws.onclose = () => {
    connected.value = false;
    // naive reconnect
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as WsMessage;
    if (msg.type === "doc-changed") {
      // The source HTML was edited on disk. Reload so the overlay sees the
      // fresh DOM. The currently-active thread survives the reload via the
      // URL hash (see hash-sync.ts), so no sessionStorage stashing needed.
      location.reload();
      return;
    }
    if (msg.type === "snapshot") {
      annotations.value = msg.annotations;
    } else if (msg.type === "upsert") {
      const isNew = !annotations.value.some((a) => a.id === msg.annotation.id);
      annotations.value = upsert(annotations.value, msg.annotation);
      // Auto-open fresh agent-authored questions so the user sees them.
      if (
        isNew &&
        msg.annotation.author.kind === "agent" &&
        msg.annotation.status === "open"
      ) {
        activeId.value = msg.annotation.id;
      }
    } else if (msg.type === "remove") {
      annotations.value = annotations.value.filter((a) => a.id !== msg.id);
    }
  };
}

export async function createAnnotation(input: {
  selectors: Selector[];
  body: string;
}): Promise<Annotation> {
  const res = await fetch("/_scribble/api/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: { source: location.pathname, selector: input.selectors },
      body: { type: "TextualBody", value: input.body },
      author: humanAuthor,
    }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  return res.json();
}

export async function resolveAnnotation(id: string, reply?: string): Promise<void> {
  const body: Record<string, unknown> = { status: "resolved" };
  if (reply) body.reply = { author: humanAuthor, body: reply };
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
}

export async function replyToAnnotation(id: string, body: string): Promise<void> {
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply: { author: humanAuthor, body } }),
  });
  if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
}

export async function reopenAnnotation(id: string): Promise<void> {
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "open" }),
  });
  if (!res.ok) throw new Error(`Reopen failed: ${res.status}`);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const res = await fetch(`/_scribble/api/annotations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
