/**
 * Card for composing a new annotation. The Track decides where to place
 * it (at the draft selection's vertical position); this component just
 * renders the body. The draft selection itself is visualized in-doc via
 * the `scribble-draft` CSS Highlight (see highlights.ts) so the user can
 * see *what* they're commenting on without the card showing a quote.
 *
 * Esc cancels, ⌘↩ submits.
 */
import { useEffect, useRef, useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { draftRange, createAnnotation } from "../store";
import { describeRange } from "../anchoring";

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
      requestAnimationFrame(() =>
        textareaRef.current?.focus({ preventScroll: true }),
      );
    }
  }, [range]);

  if (!range) return null;

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
          <button
            type="button"
            className="btn ghost"
            onClick={() => (draftRange.value = null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!body.trim() || submitting}
            onClick={submit}
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
