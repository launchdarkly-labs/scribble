/**
 * Track: the single right-column home for all annotation UI.
 *
 * Replaces the prior "floating cards over content + list sidebar" split.
 * Every annotation lives here as either a compact `ChipCard` or, when
 * active, an expanded `ThreadCard`. New comments (drafts) appear as a
 * `DraftCard` in the same column at the draft selection's vertical
 * position. The column is fixed; cards within it are positioned
 * absolutely by their *anchor's* viewport top — i.e. they follow the
 * host doc on scroll, but never leave the column.
 *
 * Why a column instead of floating-near-the-span:
 *   • Stability. The old DraftCard ran an independent positioning pass
 *     after the pill click and frequently landed far from the pill (the
 *     "the dialog teleported" bug). Likewise ThreadCard flipped above /
 *     clamped left next to its anchor, which is fine in isolation but
 *     jarring when navigating between annotations.
 *   • Spatial association is preserved (top-aligned with the anchor)
 *     while spatial *stability* is gained (cards never overlap content
 *     and never travel under the cursor).
 *   • One layout solver for both draft and existing annotations means
 *     the two surfaces no longer drift apart.
 *
 * Layout solver — for every annotation whose anchor is in the visible
 * viewport, compute its desired top = anchor.getBoundingClientRect().top.
 * Sort by desired top, then walk in order:
 *     placed.top = max(cursor, desiredTop); cursor = top + height + GAP
 * That gives "as close to the anchor as possible, but never overlapping
 * the previous card." Off-screen annotations are not rendered as chips,
 * but counted into the "↑ N above" / "↓ N below" jump buttons at the
 * track edges, so they're still reachable.
 *
 * Heights are constants (`CHIP_H`, `ACTIVE_H`, `DRAFT_H`) — overestimating
 * is safer than underestimating because too-large estimates only insert
 * extra whitespace, while too-small estimates would let cards overlap.
 * The cards themselves cap their internal scrolls so they don't blow
 * past those constants in practice (see `.card` max-height in CSS).
 *
 * Active-card reveal still goes through the dialog coordinator: the
 * chip→expanded swap is gated on `showThreadForId` so it doesn't happen
 * mid-smooth-scroll. The chip itself is in place throughout, so the swap
 * is a same-location transition rather than a flying-in card.
 */
import { useEffect, useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import {
  annotations,
  activeId,
  draftRange,
  connected,
  unresolved,
  orphanedIds,
  showThreadForId,
} from "../store";
import { locate } from "../anchoring";
import type { Annotation } from "@/shared/types";
import { authorLabel } from "@/shared/types";
import { ThreadCard } from "./ThreadCard";
import { DraftCard } from "./DraftCard";
import { ChipCard } from "./ChipCard";

// Layout constants. Keep in sync with .card max-heights in overlay.css.
const HEADER_H = 48;
const TRACK_PAD_TOP = 8;
const GAP = 8;
const CHIP_H = 64;
const ACTIVE_H = 360;
const DRAFT_H = 180;

type Item =
  | { kind: "draft"; id: "__draft__"; desiredTop: number; height: number }
  | {
      kind: "ann";
      id: string;
      ann: Annotation;
      desiredTop: number;
      height: number;
    };

export function Track() {
  useSignals();
  const all = annotations.value;
  const aid = activeId.value;
  const showId = showThreadForId.value;
  const orphanSet = orphanedIds.value;
  const draft = draftRange.value;

  // Re-render on scroll/resize, rAF-throttled, so anchored positions stay
  // glued to their targets as the user scrolls the host doc.
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf: number | null = null;
    const bump = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        setTick((t) => t + 1);
      });
    };
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
    };
  }, []);

  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  const items: Item[] = [];
  let aboveCount = 0;
  let belowCount = 0;

  for (const a of all) {
    if (orphanSet.has(a.id)) continue;
    const range = locate(a.target.selector, document.body);
    if (!range) continue;
    const r = range.getBoundingClientRect();
    if (r.bottom < 0) {
      aboveCount++;
      continue;
    }
    if (r.top > vh) {
      belowCount++;
      continue;
    }
    const isActive = a.id === aid && a.id === showId;
    items.push({
      kind: "ann",
      id: a.id,
      ann: a,
      desiredTop: r.top,
      height: isActive ? ACTIVE_H : CHIP_H,
    });
  }

  if (draft) {
    const r = draft.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      items.push({
        kind: "draft",
        id: "__draft__",
        desiredTop: r.top,
        height: DRAFT_H,
      });
    }
  }

  items.sort((a, b) => a.desiredTop - b.desiredTop);
  let cursor = HEADER_H + TRACK_PAD_TOP;
  const laid = items.map((it) => {
    const top = Math.max(cursor, it.desiredTop);
    cursor = top + it.height + GAP;
    return { ...it, top };
  });

  const orphans = all.filter((a) => orphanSet.has(a.id));

  return (
    <aside
      className="track"
      onClick={(e) => {
        // Clicking track chrome (background, header) deselects the active
        // thread, mirroring the host-doc background-click behavior.
        const t = e.target as Element | null;
        if (!t?.closest?.(".track-slot, .track-nav, .orphans-drawer, button")) {
          if (activeId.value) activeId.value = null;
        }
      }}
    >
      <header className="track-header">
        <span className="track-title">Scribble</span>
        <span className="track-status">
          <span className={`dot ${connected.value ? "live" : ""}`} />
          {unresolved.value.length} open
        </span>
      </header>
      <div className="track-body">
        {all.length === 0 && !draft && (
          <div className="track-empty">
            Select text in the document and press <kbd>⌘K</kbd> or click the
            pill to leave a comment.
          </div>
        )}
        {aboveCount > 0 && (
          <button
            type="button"
            className="track-nav above"
            onClick={() => scrollToNextAbove(all, orphanSet)}
            title="Scroll to the next annotation above"
          >
            ↑ {aboveCount} above
          </button>
        )}
        {laid.map((item) => (
          <div key={item.id} className="track-slot" style={{ top: item.top }}>
            {item.kind === "draft" ? (
              <DraftCard />
            ) : item.ann.id === aid && item.ann.id === showId ? (
              <ThreadCard annotation={item.ann} />
            ) : (
              <ChipCard annotation={item.ann} />
            )}
          </div>
        ))}
        {belowCount > 0 && (
          <button
            type="button"
            className="track-nav below"
            onClick={() => scrollToNextBelow(all, orphanSet, vh)}
            title="Scroll to the next annotation below"
          >
            ↓ {belowCount} below
          </button>
        )}
      </div>
      {orphans.length > 0 && <OrphansDrawer orphans={orphans} />}
    </aside>
  );
}

function scrollToNextAbove(all: Annotation[], orphanSet: Set<string>) {
  let best: Element | null = null;
  let bestTop = -Infinity;
  for (const a of all) {
    if (orphanSet.has(a.id)) continue;
    const range = locate(a.target.selector, document.body);
    if (!range) continue;
    const r = range.getBoundingClientRect();
    if (r.bottom < 0 && r.top > bestTop) {
      bestTop = r.top;
      best =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer as Text).parentElement
          : (range.startContainer as Element);
    }
  }
  best?.scrollIntoView({ block: "center" });
}

function scrollToNextBelow(
  all: Annotation[],
  orphanSet: Set<string>,
  vh: number,
) {
  let best: Element | null = null;
  let bestTop = Infinity;
  for (const a of all) {
    if (orphanSet.has(a.id)) continue;
    const range = locate(a.target.selector, document.body);
    if (!range) continue;
    const r = range.getBoundingClientRect();
    if (r.top > vh && r.top < bestTop) {
      bestTop = r.top;
      best =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer as Text).parentElement
          : (range.startContainer as Element);
    }
  }
  best?.scrollIntoView({ block: "center" });
}

/**
 * Orphans sit outside the anchored layout because they have no anchor.
 * A collapsible drawer pinned to the bottom of the track gives them a
 * stable home without polluting the anchored column.
 */
function OrphansDrawer({ orphans }: { orphans: Annotation[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="orphans-drawer">
      <button
        type="button"
        className={`orphans-toggle ${open ? "" : "collapsed"}`}
        onClick={() => setOpen((o) => !o)}
        title="These annotations point at text that's no longer in the document."
      >
        <span className="caret">▾</span>
        <span>Orphaned</span>
        <span className="count">· {orphans.length}</span>
      </button>
      {open && (
        <div className="orphans-list">
          {orphans.map((a) => (
            <OrphanItem key={a.id} ann={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrphanItem({ ann }: { ann: Annotation }) {
  const quote = ann.target.selector.find((s) => s.type === "TextQuoteSelector");
  const exact = quote && "exact" in quote ? quote.exact : "";
  return (
    <div className="orphan-item">
      <div className="chip-head">
        <span className="chip-author">
          {ann.author.kind === "agent" ? "🤖" : "👤"} {authorLabel(ann.author)}
        </span>
        <span className="status-pill orphaned">not found</span>
      </div>
      {exact && <div className="orphan-quote">{exact}</div>}
      <div className="chip-body">{ann.body.value}</div>
    </div>
  );
}
