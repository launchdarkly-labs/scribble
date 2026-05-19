/**
 * Anchoring: Range ↔ W3C selectors.
 *
 * We persist BOTH a TextQuoteSelector (survives edits via prefix/suffix) and
 * a TextPositionSelector (fast & exact for the unchanged case). On resolve,
 * try quote first, fall back to position.
 *
 * This is a small first-principles port of the dom-anchor-* libraries —
 * good enough to ship v0, easy to swap later if we want their full behavior.
 */
import type {
  Selector,
  TextQuoteSelector,
  TextPositionSelector,
} from "@/shared/types";

const CONTEXT_LEN = 32;

/** Get the visible text of `root` and a mapping back to (node, offset). */
function flatten(root: Node): { text: string; nodes: Text[]; offsets: number[] } {
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text inside our own overlay
      const parent = (node as Text).parentElement;
      if (parent?.closest("#scribble-root")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    nodes.push(t);
    offsets.push(text.length);
    text += t.data;
  }
  return { text, nodes, offsets };
}

function pointToNode(
  pos: number,
  nodes: Text[],
  offsets: number[],
): { node: Text; offset: number } | null {
  if (nodes.length === 0) return null;
  // Binary search
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  const node = nodes[lo]!;
  const offset = Math.min(pos - offsets[lo]!, node.data.length);
  return { node, offset };
}

/** Convert a live DOM Range to W3C selectors. */
export function describeRange(range: Range, root: Node = document.body): Selector[] {
  const { text, nodes, offsets } = flatten(root);

  // Compute start/end as text positions
  const start = textOffsetOf(range.startContainer, range.startOffset, nodes, offsets);
  const end = textOffsetOf(range.endContainer, range.endOffset, nodes, offsets);
  if (start == null || end == null || start === end) return [];

  const exact = text.slice(start, end);
  const prefix = text.slice(Math.max(0, start - CONTEXT_LEN), start);
  const suffix = text.slice(end, Math.min(text.length, end + CONTEXT_LEN));

  const quote: TextQuoteSelector = { type: "TextQuoteSelector", exact, prefix, suffix };
  const pos: TextPositionSelector = { type: "TextPositionSelector", start, end };
  return [quote, pos];
}

function textOffsetOf(
  container: Node,
  offset: number,
  nodes: Text[],
  offsets: number[],
): number | null {
  // If the container is a text node, find its index.
  if (container.nodeType === Node.TEXT_NODE) {
    const idx = nodes.indexOf(container as Text);
    if (idx === -1) return null;
    return offsets[idx]! + offset;
  }
  // Element container: offset is a child index. Find the first text descendant of children[offset].
  const el = container as Element;
  const child = el.childNodes[offset] ?? el.childNodes[el.childNodes.length - 1];
  if (!child) return null;
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode() as Text | null;
  if (first) {
    const idx = nodes.indexOf(first);
    if (idx !== -1) return offsets[idx]!;
  }
  // Fall back: find nearest preceding text in `nodes`
  return null;
}

/** Try to find a live DOM Range that matches the given selectors. */
export function locate(selectors: Selector[], root: Node = document.body): Range | null {
  const { text, nodes, offsets } = flatten(root);

  // 1. Try TextQuoteSelector with prefix/suffix disambiguation.
  const quote = selectors.find((s): s is TextQuoteSelector => s.type === "TextQuoteSelector");
  if (quote) {
    const pos = findQuote(text, quote);
    if (pos) return rangeFromPositions(pos.start, pos.end, nodes, offsets);
  }

  // 2. Fall back to TextPositionSelector.
  const tpos = selectors.find(
    (s): s is TextPositionSelector => s.type === "TextPositionSelector",
  );
  if (tpos && tpos.end <= text.length) {
    return rangeFromPositions(tpos.start, tpos.end, nodes, offsets);
  }

  return null;
}

function findQuote(
  haystack: string,
  q: TextQuoteSelector,
): { start: number; end: number } | null {
  const exact = q.exact;
  if (!exact) return null;
  const candidates: number[] = [];
  let from = 0;
  while (true) {
    const i = haystack.indexOf(exact, from);
    if (i === -1) break;
    candidates.push(i);
    from = i + 1;
    if (candidates.length > 50) break; // safety
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1)
    return { start: candidates[0]!, end: candidates[0]! + exact.length };

  // Disambiguate by prefix/suffix overlap
  let best = candidates[0]!;
  let bestScore = -1;
  for (const c of candidates) {
    const prefix = haystack.slice(Math.max(0, c - CONTEXT_LEN), c);
    const suffix = haystack.slice(c + exact.length, c + exact.length + CONTEXT_LEN);
    const score =
      suffixOverlap(q.prefix ?? "", prefix) + prefixOverlap(q.suffix ?? "", suffix);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { start: best, end: best + exact.length };
}

function suffixOverlap(a: string, b: string): number {
  // Longest suffix of `a` matching suffix of `b`
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function prefixOverlap(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function rangeFromPositions(
  start: number,
  end: number,
  nodes: Text[],
  offsets: number[],
): Range | null {
  const s = pointToNode(start, nodes, offsets);
  const e = pointToNode(end, nodes, offsets);
  if (!s || !e) return null;
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}
