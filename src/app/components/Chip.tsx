/**
 * Compact preview of one annotation in the track's list mode. Renders
 * the author, the first couple of lines of the body, and a reply count
 * when there are replies. Clicking it activates the annotation, which
 * switches the track to focus mode and scrolls the doc to the anchor.
 *
 * The host element is a `<Button render={<div />} nativeButton={false}>`
 * — a div that base-ui has dressed in button semantics (role="button",
 * tabindex, Enter/Space key handlers, disabled state plumbing). A real
 * `<button>` would force phrasing-content semantics that conflict with
 * the chip's two-row flex layout; this gets us the affordance without
 * the constraint.
 */
import { Button } from "@base-ui/react/button";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { activeIdAtom, hoverIdAtom } from "../atoms";
import type { Annotation } from "@/shared/types";
import { authorLabel } from "@/shared/types";

export function Chip({ annotation: ann }: { annotation: Annotation }) {
  const hoverId = useAtomValue(hoverIdAtom);
  const setActive = useAtomSet(activeIdAtom);
  const setHover = useAtomSet(hoverIdAtom);
  const isHover = hoverId === ann.id;

  return (
    <Button
      render={<div />}
      nativeButton={false}
      className={`chip ${ann.status} ${isHover ? "hover" : ""}`}
      onClick={() => setActive(ann.id)}
      onMouseEnter={() => setHover(ann.id)}
      onMouseLeave={() => {
        if (hoverId === ann.id) setHover(null);
      }}
    >
      <div className="chip-head">
        <span className="chip-author">
          {ann.author.kind === "agent" ? "🤖" : "👤"} {authorLabel(ann.author)}
        </span>
        <span className={`status-pill ${ann.status}`}>{ann.status}</span>
      </div>
      <div className="chip-body">{ann.body.value}</div>
      {ann.replies.length > 0 && (
        <div className="chip-meta">
          {ann.replies.length} {ann.replies.length === 1 ? "reply" : "replies"}
        </div>
      )}
    </Button>
  );
}
