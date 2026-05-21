/**
 * Collapsed state of the right-edge track. A narrow rail showing the
 * open-annotation count and a single button to expand the track.
 *
 * Why we keep a rail instead of hiding the track entirely:
 *   • Reflow between "no chrome" and "360px column" is jarring on long
 *     docs; rail ↔ full is only 328px of reflow vs 360px.
 *   • A persistent count is a useful at-a-glance for "is there review
 *     activity on this doc?" without having to expand.
 *   • Expansion stays one click away rather than hunting for a toggle.
 *
 * The rail is purely a presentational shell here \u2014 the open/close state
 * lives in `trackOpen` (store.ts) and is owned by Track.
 */
import { useSignals } from "@preact/signals-react/runtime";
import { trackOpen, unresolved, connected } from "../store";

export function Rail() {
  useSignals();
  const count = unresolved.value.length;
  return (
    <aside
      className="rail"
      role="button"
      tabIndex={0}
      title="Open annotations"
      aria-label={`Open ${count} annotation${count === 1 ? "" : "s"}`}
      onClick={() => {
        trackOpen.value = true;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          trackOpen.value = true;
        }
      }}
    >
      <div className="rail-top">
        <span className={`dot ${connected.value ? "live" : ""}`} />
        <span className="rail-count">{count}</span>
      </div>
      <div className="rail-chev" aria-hidden="true">
        ‹
      </div>
    </aside>
  );
}
