/**
 * Compact card for an annotation in the track. Click → activates the
 * annotation, which expands the chip in place into a full ThreadCard
 * (the swap happens inside Track based on activeId / showThreadForId).
 *
 * No positioning logic; the Track decides where this lives.
 */
import { useSignals } from "@preact/signals-react/runtime";
import { activeId, hoverId } from "../store";
import type { Annotation } from "@/shared/types";
import { authorLabel } from "@/shared/types";

export function ChipCard({ annotation: ann }: { annotation: Annotation }) {
  useSignals();
  const isHover = hoverId.value === ann.id;
  const activate = () => {
    activeId.value = ann.id;
  };
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
      onMouseEnter={() => {
        hoverId.value = ann.id;
      }}
      onMouseLeave={() => {
        if (hoverId.value === ann.id) hoverId.value = null;
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
