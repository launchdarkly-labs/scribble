/**
 * Right-column annotation UI, built on base-ui's Drawer in non-modal,
 * slide-over mode. The Drawer owns open/close state and animation; we
 * just bind its `open` to `trackOpenAtom` and its `onOpenChange` to a
 * handler that also clears any focus state.
 *
 * Shape:
 *   • Drawer.Trigger    Always-visible rail in the grid's right column.
 *                       Click → expands the popup.
 *   • Drawer.Popup      The actual track. Slides over the rail (and a
 *                       slice of the iframe) when open. Non-modal so the
 *                       user can still interact with the doc behind it.
 *   • Drawer.Close      Wired into the header ✕; closes via the same
 *                       onOpenChange path.
 *
 * Inside the popup we still have two modes — List and Focus — driven
 * by whether anything is activated. See ListBody / FocusBody below.
 *
 * Why a Drawer instead of conditional render of Rail/Track? Because
 *   (a) the open/close state machine + animations + a11y come for free,
 *   (b) the close button is genuinely a Drawer.Close and can't be
 *       defeated by an outside effect (no inference loop), and
 *   (c) the slide-over pattern is what we actually want (no iframe
 *       reflow on toggle, just a panel sliding in).
 */
import { useMemo, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Drawer } from "@base-ui/react/drawer";
import { X, MessageSquareText, ChevronLeftThin } from "../icons";
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
import { Scroll } from "./Scroll";

// Layout constants. Keep in sync with .card max-heights in app.css.
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

  const activeAnn = aid ? all.find((a) => a.id === aid) ?? null : null;
  const focused = !!(activeAnn || draft);
  const orphans = all.filter((a) => orphanSet.has(a.id));

  // Single source of truth for "should be open." When closing, also
  // clear focus state so we don't return to a zombie "closed but
  // selected" state next time the rail is clicked.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (aid) setActive(null);
      if (draft) setDraft(null);
    }
    setOpen(next);
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal={false}
      // Outside clicks must NOT dismiss — the user clicks doc text all
      // the time and that shouldn't close the panel.
      disablePointerDismissal
    >
      <Drawer.Trigger className="rail" aria-label="Open scribble">
        <RailContent count={unresolvedCount} connected={connected} />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Viewport className="drawer-viewport">
          <Drawer.Popup className="track-popup">
            <header className="track-header">
              <Drawer.Title className="track-title">Scribble</Drawer.Title>
              <span className="track-status">
                <span className={`dot ${connected ? "live" : ""}`} />
                {unresolvedCount} open
              </span>
              <Drawer.Close
                className="icon-btn"
                aria-label="Collapse to rail"
                title="Collapse to rail"
              >
                <X size={16} />
              </Drawer.Close>
            </header>
            {focused ? (
              <FocusBody ann={activeAnn} draft={draft} />
            ) : (
              <ListBody annotations={all} orphanSet={orphanSet} />
            )}
            {orphans.length > 0 && <OrphansDrawer orphans={orphans} />}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ───────────────  Rail (trigger content)  ─────────────── */

function RailContent({
  count,
  connected,
}: {
  count: number;
  connected: boolean;
}) {
  return (
    <>
      <div className="rail-top">
        <span
          className={`dot ${connected ? "live" : ""}`}
          aria-hidden="true"
        />
        <MessageSquareText
          className="rail-icon"
          size={16}
          aria-hidden="true"
        />
        {count > 0 && <span className="rail-count">{count}</span>}
      </div>
      <div className="rail-wordmark">Scribble</div>
      <ChevronLeftThin className="rail-chev" />
    </>
  );
}



/* ───────────────  List mode  ─────────────── */

function ListBody({
  annotations,
  orphanSet,
}: {
  annotations: Annotation[];
  orphanSet: Set<string>;
}) {
  const [resolvedExpanded, setResolvedExpanded] = useState(false);

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
      {open.length === 0 && resolved.length > 0 && !resolvedExpanded && (
        <div className="track-empty-soft">All open threads resolved. ✓</div>
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
