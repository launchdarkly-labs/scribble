import { useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { annotations, activeId, hoverId, connected, unresolved, orphanedIds } from "../store";
import type { Annotation } from "@/shared/types";

export function Sidebar() {
  useSignals();
  const all = annotations.value;
  const orphanSet = orphanedIds.value;
  const open = all.filter((a) => a.status === "open" && !orphanSet.has(a.id));
  const resolved = all.filter((a) => a.status === "resolved" && !orphanSet.has(a.id));
  const orphans = all.filter((a) => orphanSet.has(a.id));

  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [orphansExpanded, setOrphansExpanded] = useState(true);

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

            {orphans.length > 0 && (
              <>
                <button
                  type="button"
                  className={`section-label orphans ${orphansExpanded ? "" : "collapsed"}`}
                  onClick={() => setOrphansExpanded((v) => !v)}
                  title="These annotations point at text that's no longer in the document."
                >
                  <span className="caret">▾</span>
                  <span>Orphaned</span>
                  <span className="count">· {orphans.length}</span>
                </button>
                {orphansExpanded &&
                  orphans.map((a) => <Item key={a.id} ann={a} orphaned />)}
              </>
            )}

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

function Item({ ann, orphaned }: { ann: Annotation; orphaned?: boolean }) {
  useSignals();
  const isActive = activeId.value === ann.id;
  const quote = ann.target.selector.find((s) => s.type === "TextQuoteSelector");
  const exact = quote && "exact" in quote ? quote.exact : "";

  return (
    <div
      className={`item ${isActive ? "active" : ""} ${ann.status === "resolved" ? "resolved" : ""} ${orphaned ? "orphaned" : ""}`}
      onClick={() => {
        // Orphaned items can't open a ThreadCard meaningfully (their range
        // is gone). Toggling activeId would just close the sidebar selection.
        if (orphaned) return;
        activeId.value = isActive ? null : ann.id;
      }}
      onMouseEnter={() => {
        if (!orphaned) hoverId.value = ann.id;
      }}
      onMouseLeave={() => {
        if (hoverId.value === ann.id) hoverId.value = null;
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (orphaned) return;
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
        <span className={`status-pill ${orphaned ? "orphaned" : ann.status}`}>
          {orphaned ? "not found" : ann.status}
        </span>
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
