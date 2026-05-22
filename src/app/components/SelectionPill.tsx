/**
 * Watches the iframe document's text selection and shows a "Comment ⌘K"
 * pill above it in app-coordinate space.
 *
 * Coordinate translation: the selection rect comes from the iframe's
 * coord system; we offset by `iframe.getBoundingClientRect()` to put
 * the pill in the app's fixed-position coord system. In the current
 * layout the iframe sits flush at (0,0), so the offset is usually 0 —
 * but we compute it generically in case a future header pushes the
 * iframe down.
 *
 * Clicking the pill stashes the Range and clears the iframe selection.
 * From there the Track renders the DraftCard at the selection's vertical
 * position; the user types and submits.
 */
import { useEffect, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Button } from "@base-ui/react/button";
import { MessageSquareHeart } from "lucide-react";
import {
  iframeElAtom,
  draftRangeAtom,
  docTickAtom,
  trackOpenAtom,
} from "../atoms";

export function SelectionPill() {
  const iframe = useAtomValue(iframeElAtom);
  // Subscribe to doc ticks so selection-change events (which trigger
  // ticks via IframeDoc) cause us to re-read getSelection().
  useAtomValue(docTickAtom);
  const setDraftRange = useAtomSet(draftRangeAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!iframe) {
      setRect(null);
      return;
    }
    const doc = iframe.contentDocument;
    if (!doc) {
      setRect(null);
      return;
    }
    const sel = doc.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setRect(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setRect(null);
      return;
    }
    // Translate iframe-viewport coords → app coords.
    const iframeRect = iframe.getBoundingClientRect();
    const adjusted = new DOMRect(
      iframeRect.left + r.left,
      iframeRect.top + r.top,
      r.width,
      r.height,
    );
    setRect(adjusted);
  });

  if (!rect) return null;

  const style: React.CSSProperties = {
    top: Math.max(8, rect.top - 36),
    left: rect.left + rect.width / 2,
    transform: "translateX(-50%)",
  };

  return (
    <Button
      className="pill"
      style={style}
      // pointerdown so the iframe selection is still alive when we read it
      onPointerDown={(e) => {
        e.preventDefault();
        if (!iframe?.contentDocument) return;
        const sel = iframe.contentDocument.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        setDraftRange(sel.getRangeAt(0).cloneRange());
        sel.removeAllRanges();
        setRect(null);
        setTrackOpen(true);
      }}
    >
      <MessageSquareHeart size={14} aria-hidden />
      <span>Comment</span>
      <span className="kbd">⌘K</span>
    </Button>
  );
}
