/**
 * Thin fetch wrappers around the daemon's JSON HTTP API. No optimistic
 * updates — the daemon broadcasts the canonical change over WS and our
 * subscriber updates atoms. On localhost the round trip is < 5ms, well
 * under the threshold where optimistic UI would feel different.
 *
 * Errors throw with the response status; callers (mostly form-submit
 * handlers) decide whether to surface them.
 */
import type { Annotation, Author, Selector } from "@/shared/types";

export async function createAnnotation(input: {
  selectors: Selector[];
  body: string;
  author: Author;
}): Promise<Annotation> {
  const res = await fetch("/_scribble/api/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: { source: location.pathname, selector: input.selectors },
      body: { type: "TextualBody", value: input.body },
      author: input.author,
    }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  return res.json();
}

export async function resolveAnnotation(
  id: string,
  reply: string | undefined,
  author: Author,
): Promise<void> {
  const body: Record<string, unknown> = { status: "resolved" };
  if (reply) body.reply = { author, body: reply };
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
}

export async function replyToAnnotation(
  id: string,
  body: string,
  author: Author,
): Promise<void> {
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply: { author, body } }),
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
  const res = await fetch(`/_scribble/api/annotations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
