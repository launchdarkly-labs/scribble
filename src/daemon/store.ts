/**
 * Append-only JSONL store, one file per document, kept next to the doc in
 * a `.scribble/` sibling directory.
 *
 *   docPath:  /abs/path/to/report.html
 *   storeAt:  /abs/path/to/.scribble/report.html.jsonl
 *
 * The whole file is read on demand and the latest record per `id` wins
 * (so updates / resolves are appended rather than rewriting the file).
 */
import { dirname, basename, join, resolve, isAbsolute } from "node:path";
import { mkdir } from "node:fs/promises";
import { Annotation } from "@/shared/types";

export function storePathFor(docPath: string): string {
  const abs = isAbsolute(docPath) ? docPath : resolve(docPath);
  return join(dirname(abs), ".scribble", `${basename(abs)}.jsonl`);
}

export async function readAll(docPath: string): Promise<Annotation[]> {
  const path = storePathFor(docPath);
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const text = await file.text();
  const latest = new Map<string, Annotation>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = Annotation.parse(JSON.parse(trimmed));
      latest.set(parsed.id, parsed);
    } catch (err) {
      console.warn(`[store] skipping malformed line: ${(err as Error).message}`);
    }
  }
  return [...latest.values()].sort((a, b) => a.created.localeCompare(b.created));
}

export async function append(docPath: string, ann: Annotation): Promise<void> {
  const path = storePathFor(docPath);
  await mkdir(dirname(path), { recursive: true });
  const file = Bun.file(path);
  const existing = (await file.exists()) ? await file.text() : "";
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  await Bun.write(path, existing + sep + JSON.stringify(ann) + "\n");
}

export async function update(
  docPath: string,
  id: string,
  patch: (prev: Annotation) => Annotation,
): Promise<Annotation | null> {
  const all = await readAll(docPath);
  const prev = all.find((a) => a.id === id);
  if (!prev) return null;
  const next = patch(prev);
  await append(docPath, next);
  return next;
}
