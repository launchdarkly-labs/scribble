/**
 * Compact card for an annotation in the track. Click activates the
 * annotation, which causes the Track to swap the chip for a full
 * ThreadCard in place.
 */
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { activeIdAtom, hoverIdAtom } from "../atoms";
import type { Annotation } from "@/shared/types";
import { authorLabel } from "@/shared/types";

export function ChipCard({ annotation: ann }: { annotation: Annotation }) {
  const hoverId = useAtomValue(hoverIdAtom);
  const setActive = useAtomSet(activeIdAtom);
  const setHover = useAtomSet(hoverIdAtom);
  const isHover = hoverId === ann.id;

  const activate = () => setActive(ann.id);

  return (
    <div
      className={`chip ${ann.status} ${isHover ? "hover" : ""}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
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
    </div>
  );
}
