/**
 * Collapsed state of the track. A narrow rail showing the open count,
 * the Scribble wordmark, and an expand chevron. Click anywhere on the
 * rail to expand.
 *
 * The chat-bubble icon + vertical wordmark are deliberately visible
 * even at zero annotations, so a first-time user can tell what this
 * column is and that interacting with it is the way to leave feedback.
 * (Before adding these, the rail looked like dead chrome at zero
 * annotations — confusing.)
 */
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { trackOpenAtom, unresolvedAtom, connectedAtom } from "../atoms";

export function Rail() {
  const count = useAtomValue(unresolvedAtom).length;
  const connected = useAtomValue(connectedAtom);
  const setOpen = useAtomSet(trackOpenAtom);
  return (
    <aside
      className="rail"
      role="button"
      tabIndex={0}
      title={`Scribble · ${count} open · Select text + ⌘K to comment`}
      aria-label={`Open scribble (${count} open)`}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <div className="rail-top">
        <span
          className={`dot ${connected ? "live" : ""}`}
          aria-hidden="true"
        />
        <svg
          className="rail-icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* speech bubble */}
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 1 1 21 12z" />
        </svg>
        {count > 0 && <span className="rail-count">{count}</span>}
      </div>
      <div className="rail-wordmark">Scribble</div>
      <div className="rail-chev" aria-hidden="true">
        ‹
      </div>
    </aside>
  );
}
