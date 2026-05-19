import { useEffect, useRef, useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import {
  activeAnnotation,
  activeId,
  replyToAnnotation,
  resolveAnnotation,
  reopenAnnotation,
  deleteAnnotation,
} from "../store";
import { locate } from "../anchoring";
import type { Annotation } from "@/shared/types";

const CARD_W = 360;
const SIDEBAR_W = 320;
const GAP = 16;

/**
 * Floats next to the annotated span in the host document. Shows the full
 * thread (original comment + replies), a reply textarea, and actions
 * (Resolve / Reopen / Delete / Close).
 */
export function ThreadCard() {
  useSignals();
  const ann = activeAnnotation.value;
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset reply field when switching annotations
  useEffect(() => {
    setReply("");
  }, [ann?.id]);

  // Scroll the annotated text into view when this card opens
  useEffect(() => {
    if (!ann) return;
    const range = locate(ann.target.selector, document.body);
    if (!range) return;
    const target =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? (range.startContainer as Text).parentElement
        : (range.startContainer as Element);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [ann?.id]);

  // Track the annotated range's position so the card follows on scroll/resize
  useEffect(() => {
    if (!ann) {
      setPos(null);
      return;
    }
    const update = () => {
      const range = locate(ann.target.selector, document.body);
      if (!range) {
        setPos(null);
        return;
      }
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setPos(null);
        return;
      }
      const maxLeft = window.innerWidth - SIDEBAR_W - CARD_W - GAP;
      const top = Math.min(Math.max(8, r.bottom + 8), window.innerHeight - 240);
      const left = Math.min(Math.max(8, r.left), Math.max(8, maxLeft));
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [ann?.id]);

  if (!ann || !pos) return null;

  const close = () => {
    activeId.value = null;
  };

  const submitReply = async () => {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await replyToAnnotation(ann.id, reply.trim());
      setReply("");
      textareaRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const resolveWith = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await resolveAnnotation(ann.id, reply.trim() || undefined);
      setReply("");
      close();
    } finally {
      setSubmitting(false);
    }
  };

  const reopen = async () => {
    setSubmitting(true);
    try {
      await reopenAnnotation(ann.id);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setSubmitting(true);
    try {
      await deleteAnnotation(ann.id);
      close();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="card thread-card"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Annotation thread"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="thread">
        <ThreadMessage author={ann.author} body={ann.body.value} created={ann.created} />
        {ann.replies.map((r, i) => (
          <ThreadMessage key={i} author={r.author} body={r.body} created={r.created} />
        ))}
      </div>
      <div className="thread-divider" />
      <div className="card-body">
        <textarea
          ref={textareaRef}
          placeholder={ann.status === "resolved" ? "Reopen with a reply…" : "Reply…"}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) void resolveWith();
              else void submitReply();
            }
          }}
        />
      </div>
      <div className="card-actions">
        <span className="card-hint">
          <kbd>⌘↩</kbd> reply · <kbd>⌘⇧↩</kbd> resolve
        </span>
        <div className="card-buttons">
          <button type="button" className="btn danger" onClick={remove} disabled={submitting}>
            Delete
          </button>
          {ann.status === "open" ? (
            <button type="button" className="btn ghost" onClick={resolveWith} disabled={submitting}>
              Resolve
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={reopen} disabled={submitting}>
              Reopen
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={submitReply}
            disabled={!reply.trim() || submitting}
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadMessage({
  author,
  body,
  created,
}: {
  author: Annotation["author"];
  body: string;
  created: string;
}) {
  return (
    <div className="thread-message">
      <div className="thread-message-head">
        <span className="author">{author === "agent" ? "🤖 agent" : "👤 you"}</span>
        <time dateTime={created}>{relativeTime(created)}</time>
      </div>
      <div className="thread-message-body">{body}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
