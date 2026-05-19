import { useSignals } from "@preact/signals-react/runtime";
import { annotations, activeId, connected, unresolved } from "../store";
import type { Annotation } from "@/shared/types";

export function Sidebar() {
  useSignals();
  const list = annotations.value;
  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <span className="sidebar-title">Scribble</span>
        <span className="sidebar-status">
          <span className={`dot ${connected.value ? "live" : ""}`} />
          {unresolved.value.length} open · {list.length} total
        </span>
      </header>
      <div className="sidebar-list">
        {list.length === 0 ? (
          <div className="sidebar-empty">
            Select text in the document to leave a comment.
          </div>
        ) : (
          list.map((a) => <Item key={a.id} ann={a} />)
        )}
      </div>
    </aside>
  );
}

function Item({ ann }: { ann: Annotation }) {
  useSignals();
  const isActive = activeId.value === ann.id;
  const quote = ann.target.selector.find((s) => s.type === "TextQuoteSelector");
  const exact = quote && "exact" in quote ? quote.exact : "";
  return (
    <button
      type="button"
      className={`item ${isActive ? "active" : ""} ${ann.status === "resolved" ? "resolved" : ""}`}
      onClick={() => (activeId.value = isActive ? null : ann.id)}
    >
      <div className="item-head">
        <span>{ann.author === "agent" ? "🤖 agent" : "human"}</span>
        <span>{ann.status}</span>
      </div>
      {exact ? <div className="item-quote">“{exact}”</div> : null}
      <div className="item-body">{ann.body.value}</div>
      {ann.replies.map((r, i) => (
        <div key={i} className="item-reply">
          <b>{r.author === "agent" ? "🤖 agent" : "human"}:</b> {r.body}
        </div>
      ))}
    </button>
  );
}
