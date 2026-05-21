/**
 * Card for composing a new annotation. The Track decides where to place
 * it (at the draft selection's vertical position); this component just
 * renders the body. The draft selection itself is visualized in-doc via
 * the `scribble-draft` CSS Highlight (see app/highlights.ts) so the
 * user can see *what* they're commenting on without the card showing a
 * quote.
 *
 * Esc cancels, ⌘↩ submits.
 */
import { useEffect, useRef, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { X, Send } from "../icons";
import {
  draftRangeAtom,
  humanAuthorAtom,
  iframeElAtom,
} from "../atoms";
import { describeRange } from "../anchoring";
import { createAnnotation } from "../api";

export function DraftCard() {
  const range = useAtomValue(draftRangeAtom);
  const setDraftRange = useAtomSet(draftRangeAtom);
  const author = useAtomValue(humanAuthorAtom);
  const iframe = useAtomValue(iframeElAtom);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (range) {
      setBody("");
      requestAnimationFrame(() =>
        textareaRef.current?.focus({ preventScroll: true }),
      );
    }
  }, [range]);

  if (!range) return null;

  const submit = async () => {
    if (!body.trim() || submitting) return;
    const doc = iframe?.contentDocument;
    if (!doc) {
      console.warn("[scribble] iframe doc unavailable, cannot describe range");
      return;
    }
    setSubmitting(true);
    try {
      const selectors = describeRange(range, doc);
      if (selectors.length === 0) {
        console.warn("[scribble] could not describe range");
        return;
      }
      await createAnnotation({
        selectors,
        body: body.trim(),
        author,
      });
      setDraftRange(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card draft-card" role="dialog" aria-label="New comment">
      <div className="card-body">
        <textarea
          ref={textareaRef}
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraftRange(null);
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <div className="card-actions">
        <span className="card-hint" title="⌘↩ comment  ·  esc cancel">
          <kbd>⌘↩</kbd>
        </span>
        <div className="card-buttons">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDraftRange(null)}
            title="Cancel (esc)"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            className="btn"
            disabled={!body.trim() || submitting}
            onClick={submit}
            title="⌘↩ to send"
          >
            <Send size={13} />
            <span>Comment</span>
          </button>
        </div>
      </div>
    </div>
  );
}
