import { useEffect, useRef, useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { draftRange, createAnnotation } from "../store";
import { describeRange } from "../anchoring";

// Approximate height of the card without the quote (textarea + actions row).
// Used to decide whether to flip above the selection when there's no room
// below — a real concern for multi-paragraph selections whose bottom is
// off-screen.
const CARD_HEIGHT = 150;
const CARD_WIDTH = 340;
const GAP = 8;

function positionCard(range: Range): React.CSSProperties {
  const rect = range.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Clamp the selection rect to the viewport before deciding placement.
  // For a selection that extends past the viewport bottom (multi-paragraph
  // case), the *visible* bottom is what matters — not the geometric bottom.
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom, vh);

  const spaceBelow = vh - visibleBottom;
  const spaceAbove = visibleTop;
  const placeBelow = spaceBelow >= CARD_HEIGHT + GAP || spaceBelow >= spaceAbove;

  const top = placeBelow
    ? Math.min(visibleBottom + GAP, vh - CARD_HEIGHT - GAP)
    : Math.max(GAP, visibleTop - CARD_HEIGHT - GAP);
  const left = Math.max(GAP, Math.min(rect.left, vw - CARD_WIDTH - GAP));

  return { top, left };
}

/**
 * The "new comment" floating card. Anchored to the draft Range's rect, with
 * the actual selection persisted as a `scribble-draft` CSS Highlight (see
 * highlights.ts) — so the user can see *what* they're commenting on in the
 * document itself rather than via a truncated in-card quote.
 *
 * Esc cancels, ⌘↩ submits.
 */
export function DraftCard() {
  useSignals();
  const range = draftRange.value;
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (range) {
      setBody("");
      // Defer focus until card is in DOM
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    }
  }, [range]);

  if (!range) return null;

  const style = positionCard(range);

  const submit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      const selectors = describeRange(range, document.body);
      if (selectors.length === 0) {
        console.warn("[scribble] could not describe range");
        return;
      }
      await createAnnotation({ selectors, body: body.trim() });
      draftRange.value = null;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={style} role="dialog" aria-label="New comment">
      <div className="card-body">
        <textarea
          ref={textareaRef}
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              draftRange.value = null;
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <div className="card-actions">
        <span className="card-hint">
          <kbd>⌘↩</kbd> comment · <kbd>esc</kbd> cancel
        </span>
        <div className="card-buttons">
          <button type="button" className="btn ghost" onClick={() => (draftRange.value = null)}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!body.trim() || submitting} onClick={submit}>
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
