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
import { X, Send } from "lucide-react";
import { Button } from "@base-ui/react/button";
import {
  draftRangeAtom,
  humanAuthorAtom,
  iframeElAtom,
} from "../atoms";
import { Tip } from "./Tip";
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
          // Esc is handled by the Drawer in Track.tsx (onOpenChange,
          // reason='escape-key') so the drawer can't accidentally close
          // in response. Only ⌘+Enter is local here.
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <div className="card-actions">
        <div className="card-buttons">
          <Tip label="Cancel" kbd={["Esc"]}>
            <Button
              className="icon-btn"
              onClick={() => setDraftRange(null)}
              aria-label="Cancel"
            >
              <X size={16} />
            </Button>
          </Tip>
          <Tip kbd={["⌘", "Enter"]}>
            <Button
              className="btn"
              disabled={!body.trim() || submitting}
              onClick={submit}
              focusableWhenDisabled
            >
              <Send size={14} />
              <span>Comment</span>
            </Button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
