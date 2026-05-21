/**
 * Anchoring: Range ↔ W3C selectors. Parameterized by the document whose
 * DOM the ranges live in — for the SPA that's `iframe.contentDocument`,
 * not the app's own `document`. The app's React tree contains no
 * annotatable text, so functions here intentionally only know how to
 * operate against an externally-provided Document.
 *
 * We persist BOTH a TextQuoteSelector (survives edits via prefix/suffix)
 * and a TextPositionSelector (fast & exact for the unchanged case). On
 * resolve, try quote first, fall back to position.
 *
 * History: this is a small first-principles port of the dom-anchor-*
 * libraries — good enough to ship v0, easy to swap later. The pre-
 * migration version of this file lived in src/overlay/ and assumed
 * `document` was the doc DOM; that assumption is gone now.
 */
import type {
  Selector,
  TextQuoteSelector,
  TextPositionSelector,
} from "@/shared/types";

const CONTEXT_LEN = 32;

/** Get the visible text of `root` and a mapping back to (node, offset). */
function flatten(
  root: Node,
  doc: Document,
): { text: string; nodes: Text[]; offsets: number[] } {
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let text = "";
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Skip script/style — server-side anchoring strips these too
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        return NodeFilter.FILTER_REJECT;
      }
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

/** Convert a live Range (in `doc`) to W3C selectors. */
export function describeRange(range: Range, doc: Document): Selector[] {
  const { text, nodes, offsets } = flatten(doc.body, doc);

  const start = textOffsetOf(
    range.startContainer,
    range.startOffset,
    nodes,
    offsets,
    doc,
  );
  const end = textOffsetOf(
    range.endContainer,
    range.endOffset,
    nodes,
    offsets,
    doc,
  );
  if (start == null || end == null || start === end) return [];

  const exact = text.slice(start, end);
  const prefix = text.slice(Math.max(0, start - CONTEXT_LEN), start);
  const suffix = text.slice(end, Math.min(text.length, end + CONTEXT_LEN));

  const quote: TextQuoteSelector = {
    type: "TextQuoteSelector",
    exact,
    prefix,
    suffix,
  };
  const pos: TextPositionSelector = {
    type: "TextPositionSelector",
    start,
    end,
  };
  return [quote, pos];
}

function textOffsetOf(
  container: Node,
  offset: number,
  nodes: Text[],
  offsets: number[],
  doc: Document,
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const idx = nodes.indexOf(container as Text);
    if (idx === -1) return null;
    return offsets[idx]! + offset;
  }
  const el = container as Element;
  const child = el.childNodes[offset] ?? el.childNodes[el.childNodes.length - 1];
  if (!child) return null;
  const walker = doc.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode() as Text | null;
  if (first) {
    const idx = nodes.indexOf(first);
    if (idx !== -1) return offsets[idx]!;
  }
  return null;
}

/** Find a live Range in `doc` matching the given selectors. */
export function locate(selectors: Selector[], doc: Document): Range | null {
  const { text, nodes, offsets } = flatten(doc.body, doc);

  const quote = selectors.find(
    (s): s is TextQuoteSelector => s.type === "TextQuoteSelector",
  );
  if (quote) {
    const pos = findQuote(text, quote);
    if (pos) return rangeFromPositions(pos.start, pos.end, nodes, offsets, doc);
  }

  const tpos = selectors.find(
    (s): s is TextPositionSelector => s.type === "TextPositionSelector",
  );
  if (tpos && tpos.end <= text.length) {
    return rangeFromPositions(tpos.start, tpos.end, nodes, offsets, doc);
  }

  return null;
}

function findQuote(
  haystack: string,
  q: TextQuoteSelector,
): { start: number; end: number } | null {
  const exact = q.exact;
  if (!exact) return null;
  let candidates: { start: number; end: number }[] = [];
  let from = 0;
  while (true) {
    const i = haystack.indexOf(exact, from);
    if (i === -1) break;
    candidates.push({ start: i, end: i + exact.length });
    from = i + 1;
    if (candidates.length > 50) break;
  }
  if (candidates.length === 0) {
    const escaped = exact
      .trim()
      .replace(/[\\.+*?^$(){}|[\]]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    try {
      const re = new RegExp(escaped, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(haystack)) !== null) {
        candidates.push({ start: m.index, end: m.index + m[0].length });
        if (candidates.length > 50) break;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } catch {
      /* malformed regex — give up */
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  let best = candidates[0]!;
  let bestScore = -1;
  for (const c of candidates) {
    const prefix = haystack.slice(Math.max(0, c.start - CONTEXT_LEN), c.start);
    const suffix = haystack.slice(c.end, c.end + CONTEXT_LEN);
    const score =
      suffixOverlap(q.prefix ?? "", prefix) +
      prefixOverlap(q.suffix ?? "", suffix);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function suffixOverlap(a: string, b: string): number {
  let i = 0;
  while (
    i < a.length &&
    i < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  )
    i++;
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
  doc: Document,
): Range | null {
  const s = pointToNode(start, nodes, offsets);
  const e = pointToNode(end, nodes, offsets);
  if (!s || !e) return null;
  const range = doc.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}
