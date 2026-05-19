import { z } from "zod";

/**
 * W3C Web Annotation selectors we use.
 * https://www.w3.org/TR/annotation-model/#selectors
 *
 * We persist BOTH a TextQuoteSelector (survives most edits) and a
 * TextPositionSelector (fast, exact). On resolve, try quote first; fall back to position.
 */
export const TextQuoteSelector = z.object({
  type: z.literal("TextQuoteSelector"),
  exact: z.string(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export const TextPositionSelector = z.object({
  type: z.literal("TextPositionSelector"),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const Selector = z.discriminatedUnion("type", [
  TextQuoteSelector,
  TextPositionSelector,
]);

export const Target = z.object({
  source: z.string(), // path to the doc, relative to daemon CWD
  selector: z.array(Selector).min(1),
});

export const Reply = z.object({
  author: z.enum(["human", "agent"]),
  body: z.string(),
  created: z.string(), // ISO timestamp
});

export const Annotation = z.object({
  id: z.string(),
  target: Target,
  body: z.object({
    type: z.literal("TextualBody"),
    value: z.string(),
  }),
  author: z.enum(["human", "agent"]),
  status: z.enum(["open", "resolved", "deleted"]),
  replies: z.array(Reply).default([]),
  created: z.string(),
  updated: z.string(),
});

export type TextQuoteSelector = z.infer<typeof TextQuoteSelector>;
export type TextPositionSelector = z.infer<typeof TextPositionSelector>;
export type Selector = z.infer<typeof Selector>;
export type Target = z.infer<typeof Target>;
export type Reply = z.infer<typeof Reply>;
export type Annotation = z.infer<typeof Annotation>;

/** WebSocket messages from daemon → browser. */
export type WsMessage =
  | { type: "snapshot"; annotations: Annotation[] }
  | { type: "upsert"; annotation: Annotation }
  | { type: "remove"; id: string };

/** Helper to find a selector of a given type in an annotation. */
export function findSelector<T extends Selector["type"]>(
  ann: Annotation,
  type: T,
): Extract<Selector, { type: T }> | undefined {
  return ann.target.selector.find((s) => s.type === type) as
    | Extract<Selector, { type: T }>
    | undefined;
}
