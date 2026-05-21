/**
 * Right-column home for all annotation UI. See the design notes in the
 * v0 `overlay/components/Track.tsx` (now removed) for the rationale; the
 * structural choices carry over unchanged. What's different here:
 *
 *   • All state is read via effect-atom hooks (not signals).
 *   • Anchor positions are read from the iframe's contentDocument, not
 *     the app's own document. The Track itself sits in app coordinate
 *     space, but `anchor.getBoundingClientRect()` from inside the iframe
 *     returns iframe-viewport coords; since the iframe occupies the
 *     app's full vertical extent (top 0, height 100vh), iframe-viewport
 *     y == app y for visible content. So we use those rect tops
 *     directly to position track slots.
 *   • The Track is rendered inside a grid cell that's already sized for
 *     it (32px / 360px); no body padding-right choreography needed.
 *
 * The chip→full-card swap on activation still happens — only when the
 * dialog coordinator (DialogCoordinator) has settled the scroll. That
 * keeps the active card from expanding mid-smooth-scroll if the user
 * clicked a chip whose anchor was offscreen.
 */
import { useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  annotationsAtom,
  activeIdAtom,
  draftRangeAtom,
  connectedAtom,
  unresolvedAtom,
  orphanedIdsAtom,
  trackOpenAtom,
  iframeElAtom,
  docTickAtom,
} from "../atoms";
import { locate } from "../anchoring";
import type { Annotation } from "@/shared/types";
import { authorLabel } from "@/shared/types";
import { ThreadCard } from "./ThreadCard";
import { DraftCard } from "./DraftCard";
import { ChipCard } from "./ChipCard";
import { Rail } from "./Rail";
import { Scroll } from "./Scroll";

// Layout constants. Keep in sync with .card max-heights in app.css.
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
  // Subscribing to docTick here re-runs layout every iframe scroll frame
  // so chips follow their anchors. The atom's value is unused — what
  // matters is the subscription.
  useAtomValue(docTickAtom);
  const open = useAtomValue(trackOpenAtom);
  const setOpen = useAtomSet(trackOpenAtom);
  const all = useAtomValue(annotationsAtom);
  const aid = useAtomValue(activeIdAtom);
  const setActive = useAtomSet(activeIdAtom);
  const orphanSet = useAtomValue(orphanedIdsAtom);
  const draft = useAtomValue(draftRangeAtom);
  const iframe = useAtomValue(iframeElAtom);
  const unresolvedCount = useAtomValue(unresolvedAtom).length;
  const connected = useAtomValue(connectedAtom);

  if (!open) return <Rail />;

  const doc = iframe?.contentDocument ?? null;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  const items: Item[] = [];
  let aboveCount = 0;
  let belowCount = 0;

  if (doc) {
    for (const a of all) {
      if (orphanSet.has(a.id)) continue;
      const range = locate(a.target.selector, doc);
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
      const isActive = a.id === aid;
      items.push({
        kind: "ann",
        id: a.id,
        ann: a,
        // Translate iframe-viewport top → track-body-relative top.
        desiredTop: r.top - HEADER_H,
        height: isActive ? ACTIVE_H : CHIP_H,
      });
    }

    if (draft) {
      const r = draft.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        items.push({
          kind: "draft",
          id: "__draft__",
          desiredTop: r.top - HEADER_H,
          height: DRAFT_H,
        });
      }
    }
  }

  items.sort((a, b) => a.desiredTop - b.desiredTop);
  let cursor = TRACK_PAD_TOP;
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
        // Click on track chrome (background, header) deselects, mirroring
        // host-doc background-click behavior.
        const t = e.target as Element | null;
        if (
          !t?.closest?.(".track-slot, .track-nav, .orphans-drawer, button")
        ) {
          if (aid) setActive(null);
        }
      }}
    >
      <header className="track-header">
        <span className="track-title">Scribble</span>
        <span className="track-status">
          <span className={`dot ${connected ? "live" : ""}`} />
          {unresolvedCount} open
        </span>
        <button
          type="button"
          className="track-close"
          title="Collapse to rail"
          aria-label="Collapse to rail"
          onClick={() => setOpen(false)}
        >
          ›
        </button>
      </header>
      <div className="track-body">
        {all.length === 0 && !draft && (
          <div className="track-empty">
            Select text in the document and press <kbd>⌘K</kbd> or click
            the pill to leave a comment.
          </div>
        )}
        {aboveCount > 0 && doc && (
          <button
            type="button"
            className="track-nav above"
            onClick={() => scrollToNextAbove(all, orphanSet, doc)}
            title="Scroll to the next annotation above"
          >
            ↑ {aboveCount} above
          </button>
        )}
        {laid.map((item) => (
          <div key={item.id} className="track-slot" style={{ top: item.top }}>
            {item.kind === "draft" ? (
              <DraftCard />
            ) : item.ann.id === aid ? (
              <ThreadCard annotation={item.ann} />
            ) : (
              <ChipCard annotation={item.ann} />
            )}
          </div>
        ))}
        {belowCount > 0 && doc && (
          <button
            type="button"
            className="track-nav below"
            onClick={() => scrollToNextBelow(all, orphanSet, vh, doc)}
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

function scrollToNextAbove(
  all: Annotation[],
  orphanSet: Set<string>,
  doc: Document,
) {
  let best: Element | null = null;
  let bestTop = -Infinity;
  for (const a of all) {
    if (orphanSet.has(a.id)) continue;
    const range = locate(a.target.selector, doc);
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
  doc: Document,
) {
  let best: Element | null = null;
  let bestTop = Infinity;
  for (const a of all) {
    if (orphanSet.has(a.id)) continue;
    const range = locate(a.target.selector, doc);
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
        <Scroll className="orphans-list">
          {orphans.map((a) => (
            <OrphanItem key={a.id} ann={a} />
          ))}
        </Scroll>
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
