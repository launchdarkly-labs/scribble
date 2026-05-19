import { useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { annotations, activeId, connected, unresolved } from "../store";
import { theme, cycleTheme } from "../theme";
import { readerMode, toggleReader } from "../reader";
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
        <span className="sidebar-actions">
          <span className="sidebar-status">
            <span className={`dot ${connected.value ? "live" : ""}`} />
            {unresolved.value.length} open
          </span>
          <ReaderToggle />
          <ThemeToggle />
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

function ReaderToggle() {
  useSignals();
  const on = readerMode.value;
  return (
    <button
      type="button"
      className={`theme-toggle ${on ? "on" : ""}`}
      onClick={toggleReader}
      title={`Reader mode: ${on ? "on" : "off"} (Flexoki typography for this doc)`}
      aria-pressed={on}
      aria-label={`Reader mode ${on ? "on" : "off"}`}
    >
      <svg
        viewBox="0 0 14 14"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 2.5h4a2 2 0 0 1 2 2v7a2 2 0 0 0-2-2H2zM12 2.5H8a2 2 0 0 0-2 2v7a2 2 0 0 1 2-2h4z" />
      </svg>
      <span>reader</span>
    </button>
  );
}

function ThemeIcon({ t }: { t: "auto" | "light" | "dark" }) {
  // 14×14 viewBox, 1.25-unit stroke, currentColor — designed to match
  // the text x-height when sized at 1em so flexbox center-aligns it.
  const common = {
    viewBox: "0 0 14 14",
    width: "1em",
    height: "1em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (t === "auto")
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="4.5" />
        <path d="M7 2.5v9" />
        <path d="M7 2.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" stroke="none" />
      </svg>
    );
  if (t === "light")
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="2.25" />
        <path d="M7 1.5v1.5M7 11v1.5M1.5 7h1.5M11 7h1.5M3.1 3.1l1.05 1.05M9.85 9.85l1.05 1.05M3.1 10.9l1.05-1.05M9.85 4.15l1.05-1.05" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M11.5 8.2A4.5 4.5 0 1 1 5.8 2.5a3.6 3.6 0 0 0 5.7 5.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ThemeToggle() {
  useSignals();
  const t = theme.value;
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleTheme}
      title={`Theme: ${t} (click to cycle)`}
      aria-label={`Theme: ${t}`}
    >
      <ThemeIcon t={t} />
      <span>{t}</span>
    </button>
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
