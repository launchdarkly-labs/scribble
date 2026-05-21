/**
 * Expanded thread view for an annotation. The original comment + all
 * replies + a reply textarea + actions (Resolve / Reopen / Delete).
 *
 * Positioning is the Track's responsibility — this component renders
 * the card body and nothing else.
 */
import { useEffect, useRef, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { activeIdAtom, humanAuthorAtom } from "../atoms";
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
        <span className="card-hint">
          <kbd>⌘↩</kbd> reply · <kbd>⌘⇧↩</kbd> resolve
        </span>
        <div className="card-buttons">
          <button
            type="button"
            className="btn danger"
            onClick={remove}
            disabled={submitting}
          >
            Delete
          </button>
          {ann.status === "open" ? (
            <button
              type="button"
              className="btn ghost"
              onClick={resolveWith}
              disabled={submitting}
            >
              Resolve
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost"
              onClick={reopen}
              disabled={submitting}
            >
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
