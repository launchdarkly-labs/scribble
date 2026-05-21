/**
 * Expanded thread view for an annotation. The original comment + all
 * replies + a reply textarea + actions (Resolve / Reopen / Delete).
 *
 * Positioning is the Track's responsibility — this component renders
 * the card body and nothing else.
 */
import { useEffect, useRef, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Trash2, Check, Undo2, Send } from "lucide-react";
import { activeIdAtom, humanAuthorAtom } from "../atoms";
import { Tip } from "./Tip";
import {
  replyToAnnotation,
  resolveAnnotation,
  reopenAnnotation,
  deleteAnnotation,
} from "../api";
import type { Annotation, Author } from "@/shared/types";
import { authorLabel } from "@/shared/types";
import { Scroll } from "./Scroll";

export function ThreadCard({ annotation: ann }: { annotation: Annotation }) {
  const setActive = useAtomSet(activeIdAtom);
  const author = useAtomValue(humanAuthorAtom);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setReply("");
    requestAnimationFrame(() =>
      textareaRef.current?.focus({ preventScroll: true }),
    );
  }, [ann.id]);

  const close = () => setActive(null);

  const submitReply = async () => {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await replyToAnnotation(ann.id, reply.trim(), author);
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
      await resolveAnnotation(ann.id, reply.trim() || undefined, author);
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
      role="dialog"
      aria-label="Annotation thread"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <Scroll className="thread">
        <ThreadMessage
          author={ann.author}
          body={ann.body.value}
          created={ann.created}
        />
        {ann.replies.map((r, i) => (
          <ThreadMessage
            key={i}
            author={r.author}
            body={r.body}
            created={r.created}
          />
        ))}
      </Scroll>
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
        <div className="card-buttons">
          <Tip label="Delete annotation">
            <button
              type="button"
              className="icon-btn danger"
              onClick={remove}
              disabled={submitting}
              aria-label="Delete annotation"
            >
              <Trash2 size={16} />
            </button>
          </Tip>
          {ann.status === "open" ? (
            <Tip label="Resolve" kbd={["⌘", "⇧", "Enter"]}>
              <button
                type="button"
                className="icon-btn"
                onClick={resolveWith}
                disabled={submitting}
                aria-label="Resolve"
              >
                <Check size={17} />
              </button>
            </Tip>
          ) : (
            <Tip label="Reopen">
              <button
                type="button"
                className="icon-btn"
                onClick={reopen}
                disabled={submitting}
                aria-label="Reopen"
              >
                <Undo2 size={16} />
              </button>
            </Tip>
          )}
          <Tip kbd={["⌘", "Enter"]}>
            <button
              type="button"
              className="btn"
              onClick={submitReply}
              disabled={!reply.trim() || submitting}
            >
              <Send size={14} />
              <span>Reply</span>
            </button>
          </Tip>
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
  author: Author;
  body: string;
  created: string;
}) {
  return (
    <div className="thread-message">
      <div className="thread-message-head">
        <span className="author">
          {author.kind === "agent" ? "🤖" : "👤"} {authorLabel(author)}
        </span>
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
