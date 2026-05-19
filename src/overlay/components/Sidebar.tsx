import { useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { annotations, activeId, hoverId, connected, unresolved } from "../store";
import type { Annotation } from "@/shared/types";

export function Sidebar() {
  useSignals();
  const all = annotations.value;
  const open = all.filter((a) => a.status === "open");
  const resolved = all.filter((a) => a.status === "resolved");

  const [resolvedExpanded, setResolvedExpanded] = useState(false);

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <span className="sidebar-title">Scribble</span>
        <span className="sidebar-status">
          <span className={`dot ${connected.value ? "live" : ""}`} />
          {unresolved.value.length} open
        </span>
      </header>
      <div className="sidebar-list">
        {all.length === 0 ? (
          <div className="sidebar-empty">
            Select text in the document and press <kbd>⌘K</kbd> or click the
            pill to leave a comment.
          </div>
        ) : (
          <>
            {open.length > 0 &&
              open.map((a) => <Item key={a.id} ann={a} />)}

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
                  resolved.map((a) => <Item key={a.id} ann={a} />)}
              </>
            )}
          </>
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
    <div
      className={`item ${isActive ? "active" : ""} ${ann.status === "resolved" ? "resolved" : ""}`}
      onClick={() => {
        activeId.value = isActive ? null : ann.id;
      }}
      onMouseEnter={() => {
        hoverId.value = ann.id;
      }}
      onMouseLeave={() => {
        if (hoverId.value === ann.id) hoverId.value = null;
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activeId.value = isActive ? null : ann.id;
        }
      }}
    >
      <div className="item-head">
        <span className="author">
          {ann.author === "agent" ? "🤖 agent" : "👤 you"}
        </span>
        <span className={`status-pill ${ann.status}`}>{ann.status}</span>
      </div>
      {exact ? <div className="item-quote">{exact}</div> : null}
      <div className="item-body">{ann.body.value}</div>
      {ann.replies.length > 0 ? (
        <div className="item-reply-count">
          {ann.replies.length} {ann.replies.length === 1 ? "reply" : "replies"}
        </div>
      ) : null}
    </div>
  );
}
