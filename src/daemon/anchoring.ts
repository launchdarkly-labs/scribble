/**
 * Server-side anchoring: take a raw HTML document and an agent-supplied
 * quote, locate the quote in the document, and return TextQuoteSelector
 * fields (exact text + prefix/suffix snippets) ready to persist.
 *
 * We approximate the browser's rendered text by stripping <script>/<style>
 * blocks, HTML comments, and tags, then decoding the most common entities.
 * The result is good enough for agent-supplied quotes to find their target
 * in typical HTML; the overlay's `locate()` does its own whitespace-flexible
 * matching as a fallback if the stored selector and the live DOM disagree.
 */

const CONTEXT_LEN = 32;

/** Strip HTML to approximate the browser's rendered text. */
export function extractText(html: string): string {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "");
  // Decode common entities (basic — not exhaustive).
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return text;
}

export type LocateResult =
  | { ok: true; exact: string; prefix: string; suffix: string }
  | { ok: false; error: string };

/**
 * Locate `quote` in `html`. Tries exact substring match first; falls back to
 * whitespace-flexible regex matching. If multiple matches exist, requires
 * `hintPrefix` and/or `hintSuffix` for disambiguation.
 */
export function findInDoc(
  html: string,
  quote: string,
  hintPrefix?: string,
  hintSuffix?: string,
): LocateResult {
  const text = extractText(html);
  if (!quote) return { ok: false, error: "Empty quote" };

  // Pass 1: exact substring matches.
  const exactMatches: { start: number; end: number; exact: string }[] = [];
  let from = 0;
  while (true) {
    const i = text.indexOf(quote, from);
    if (i === -1) break;
    exactMatches.push({ start: i, end: i + quote.length, exact: quote });
    from = i + 1;
    if (exactMatches.length > 100) break;
  }

  // Pass 2: whitespace-flexible matches (only if exact found nothing).
  let candidates = exactMatches;
  if (candidates.length === 0) {
    const escaped = quote
      .trim()
      .replace(/[\\.+*?^$(){}|[\]]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    let re: RegExp;
    try {
      re = new RegExp(escaped, "g");
    } catch {
      return { ok: false, error: "Quote could not be turned into a search pattern" };
    }
    candidates = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      candidates.push({ start: m.index, end: m.index + m[0].length, exact: m[0] });
      if (candidates.length > 100) break;
      if (m.index === re.lastIndex) re.lastIndex++; // avoid infinite loop on zero-width
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error: `Quote not found in document: ${JSON.stringify(truncate(quote, 80))}`,
    };
  }

  let chosen = candidates[0]!;
  if (candidates.length > 1) {
    if (!hintPrefix && !hintSuffix) {
      return {
        ok: false,
        error: `Quote matched ${candidates.length} times in document; pass --prefix or --suffix to disambiguate.`,
      };
    }
    let bestScore = -1;
    for (const c of candidates) {
      const before = text.slice(Math.max(0, c.start - CONTEXT_LEN * 4), c.start);
      const after = text.slice(c.end, c.end + CONTEXT_LEN * 4);
      let score = 0;
      if (hintPrefix && before.includes(hintPrefix)) score += 2;
      if (hintSuffix && after.includes(hintSuffix)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        chosen = c;
      }
    }
    if (bestScore <= 0) {
      return {
        ok: false,
        error: `Could not disambiguate ${candidates.length} matches with the given --prefix / --suffix.`,
      };
    }
  }

  const prefix = text.slice(Math.max(0, chosen.start - CONTEXT_LEN), chosen.start);
  const suffix = text.slice(chosen.end, Math.min(text.length, chosen.end + CONTEXT_LEN));
  return { ok: true, exact: chosen.exact, prefix, suffix };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
