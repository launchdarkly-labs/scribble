/**
 * Right-column annotation UI. Three states:
 *
 *   • Rail        — collapsed; narrow strip + count + chevron.
 *   • List mode   — open, no activation. All non-orphan annotations as
 *                   chips, sorted by document position. Use to browse.
 *   • Focus mode  — open, with an `activeId` or `draftRange`. A single
 *                   card pinned to its anchor's spatial position in the
 *                   track. Use to read and respond.
 *
 * Transitions:
 *   List   → Focus  click a chip / click an in-doc highlight /
 *                   start a draft / hash deep-link / agent question
 *                   arrives via WS.
 *   Focus  → List   Esc, click the track background, click outside the
 *                   active anchor in the doc, or scroll the anchor far
 *                   enough out of view (ActivationScroller's IO grace).
 *   Either → Rail   click ✕ in the track header.
 *   Rail   → ?      click the rail; lands in List (no activation) or
 *                   Focus (if there happens to be an activeId/draft).
 *
 * Sorting in List mode uses TextPositionSelector.start (a stable text
 * offset) rather than getBoundingClientRect, so it doesn't depend on
 * the iframe doc being loaded yet and doesn't churn on scroll.
 */
import { useMemo, useState } from "react";
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
import type { Annotation, Selector } from "@/shared/types";
import { authorLabel } from "@/shared/types";
import { ThreadCard } from "./ThreadCard";
import { DraftCard } from "./DraftCard";
import { ChipCard } from "./ChipCard";
import { Rail } from "./Rail";
import { Scroll } from "./Scroll";

// Spatial constants for focus mode. Keep in sync with .card max-heights.
const HEADER_H = 48;
const TRACK_PAD_TOP = 8;
const GAP = 8;
const ACTIVE_H = 360;
const DRAFT_H = 180;

function positionStart(selectors: Selector[]): number {
  for (const s of selectors) {
    if (s.type === "TextPositionSelector") return s.start;
  }
  return Number.POSITIVE_INFINITY;
}

export function Track() {
  const open = useAtomValue(trackOpenAtom);
  const setOpen = useAtomSet(trackOpenAtom);
  const all = useAtomValue(annotationsAtom);
  const aid = useAtomValue(activeIdAtom);
  const setActive = useAtomSet(activeIdAtom);
  const orphanSet = useAtomValue(orphanedIdsAtom);
  const draft = useAtomValue(draftRangeAtom);
  const setDraft = useAtomSet(draftRangeAtom);
  const unresolvedCount = useAtomValue(unresolvedAtom).length;
  const connected = useAtomValue(connectedAtom);

  // Closing the track also drops any active focus. Otherwise we'd be
  // in a weird "closed, but a thread is selected" state — and on the
  // user's next interaction AutoOpenTrack might spring the column back
  // open uninvited.
  const closeTrack = () => {
    if (aid) setActive(null);
    if (draft) setDraft(null);
    setOpen(false);
  };

  if (!open) return <Rail />;

  const activeAnn = aid ? all.find((a) => a.id === aid) ?? null : null;
  const focused = !!(activeAnn || draft);
  const orphans = all.filter((a) => orphanSet.has(a.id));

  return (
    <aside
      className="track"
      onClick={(e) => {
        // Click on track chrome (background, header) in focus mode →
        // exit to list. List mode background clicks are a no-op.
        const t = e.target as Element | null;
        if (focused && !t?.closest?.(".track-slot, .orphans-drawer, button")) {
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
          onClick={closeTrack}
        >
          ›
        </button>
      </header>
      {focused ? (
        <FocusBody ann={activeAnn} draft={draft} />
      ) : (
        <ListBody
          annotations={all}
          orphanSet={orphanSet}
          unresolvedCount={unresolvedCount}
        />
      )}
      {orphans.length > 0 && <OrphansDrawer orphans={orphans} />}
    </aside>
  );
}

/* ───────────────  List mode  ─────────────── */

function ListBody({
  annotations,
  orphanSet,
  unresolvedCount,
}: {
  annotations: Annotation[];
  orphanSet: Set<string>;
  unresolvedCount: number;
}) {
  const [resolvedExpanded, setResolvedExpanded] = useState(false);

  // Sort once per annotations change; TextPositionSelector.start is the
  // stable text offset (server-side authored), so this doesn't depend
  // on the iframe doc being loaded.
  const { open, resolved } = useMemo(() => {
    const sorted = [...annotations].sort(
      (a, b) =>
        positionStart(a.target.selector) - positionStart(b.target.selector),
    );
    const open: Annotation[] = [];
    const resolved: Annotation[] = [];
    for (const a of sorted) {
      if (orphanSet.has(a.id)) continue;
      (a.status === "open" ? open : resolved).push(a);
    }
    return { open, resolved };
  }, [annotations, orphanSet]);

  if (annotations.length === 0) {
    return (
      <div className="track-body">
        <div className="track-empty">
          Select text in the document and press <kbd>⌘K</kbd> or click the
          pill to leave a comment.
        </div>
      </div>
    );
  }

  return (
    <Scroll className="track-list">
      {open.map((a) => (
        <ChipCard key={a.id} annotation={a} />
      ))}
      {resolved.length > 0 && (
        <>
          <button
            type="button"
            className={`section-label ${resolvedExpanded ? "" : "collapsed"}`}
            onClick={() => setResolvedExpanded((v) => !v)}
          >
            <span className="caret">▾</span>
            <span>Resolved</span>
            <span className="count">· {resolved.length}</span>
          </button>
          {resolvedExpanded &&
            resolved.map((a) => <ChipCard key={a.id} annotation={a} />)}
        </>
      )}
      {unresolvedCount === 0 && resolved.length > 0 && !resolvedExpanded && (
        <div className="track-empty-soft">
          All open threads resolved. ✓
        </div>
      )}
    </Scroll>
  );
}

/* ───────────────  Focus mode  ─────────────── */

function FocusBody({
  ann,
  draft,
}: {
  ann: Annotation | null;
  draft: Range | null;
}) {
  // Subscribe to docTick so the focused card follows iframe scroll.
  useAtomValue(docTickAtom);
  const iframe = useAtomValue(iframeElAtom);
  const doc = iframe?.contentDocument ?? null;

  type Item =
    | { kind: "ann"; top: number; height: number; ann: Annotation }
    | { kind: "draft"; top: number; height: number };

  const items: Item[] = [];
  if (ann && doc) {
    const range = locate(ann.target.selector, doc);
    if (range) {
      const r = range.getBoundingClientRect();
      items.push({
        kind: "ann",
        top: r.top - HEADER_H,
        height: ACTIVE_H,
        ann,
      });
    }
  }
  if (draft) {
    const r = draft.getBoundingClientRect();
    items.push({
      kind: "draft",
      top: r.top - HEADER_H,
      height: DRAFT_H,
    });
  }

  // Resolve collisions (relevant only when both active and draft are
  // open and their anchors are close together).
  items.sort((a, b) => a.top - b.top);
  let cursor = TRACK_PAD_TOP;
  const laid = items.map((it) => {
    const top = Math.max(cursor, it.top);
    cursor = top + it.height + GAP;
    return { ...it, top };
  });

  return (
    <div className="track-body">
      {laid.map((item, i) => (
        <div
          key={item.kind === "ann" ? item.ann.id : `__draft__${i}`}
          className="track-slot"
          style={{ top: item.top }}
        >
          {item.kind === "draft" ? (
            <DraftCard />
          ) : (
            <ThreadCard annotation={item.ann} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────────────  Orphans drawer  ─────────────── */

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
