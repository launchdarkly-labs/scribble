/**
 * Overlay state: signals + websocket sync to the daemon.
 *
 * The daemon is the source of truth. Mutations go through HTTP, the daemon
 * persists + broadcasts, the WS handler updates signals. We do *not* do
 * optimistic updates in v0 — the round-trip on localhost is too fast for it
 * to matter and we avoid reconciliation bugs.
 */
import { signal, computed } from "@preact/signals-react";
import type { Annotation, Selector, WsMessage } from "@/shared/types";

export const annotations = signal<Annotation[]>([]);
export const activeId = signal<string | null>(null);
export const hoverId = signal<string | null>(null);
export const draftRange = signal<Range | null>(null);
export const connected = signal(false);

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
    if (msg.type === "snapshot") annotations.value = msg.annotations;
    else if (msg.type === "upsert") annotations.value = upsert(annotations.value, msg.annotation);
    else if (msg.type === "remove")
      annotations.value = annotations.value.filter((a) => a.id !== msg.id);
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
      author: "human",
    }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  return res.json();
}

export async function resolveAnnotation(id: string, reply?: string): Promise<void> {
  const body: Record<string, unknown> = { status: "resolved" };
  if (reply) body.reply = { author: "human", body: reply };
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
    body: JSON.stringify({ reply: { author: "human", body } }),
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
