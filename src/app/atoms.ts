/**
 * All app state lives here as effect-atom Atoms. Replaces the prior
 * @preact/signals-react store. Each atom is `Atom.keepAlive` so React
 * subscriptions don't reset the value when the last subscriber unmounts
 * — most of this state is app-global (annotations list, active id, etc.)
 * and we never want to lose it as components rerender.
 *
 * Conventions:
 *   • Writable atoms are exported as `xAtom`. Read from anywhere with
 *     `useAtomValue(xAtom)`, mutate with `useAtomSet(xAtom)`.
 *   • Derived atoms read from others via `Atom.make((get) => …)` and are
 *     also exported as `xAtom` (the "atom" suffix is the convention —
 *     callsites disambiguate read vs write by which hook they use).
 *   • Side-effectful state (the WebSocket, selection listeners, scroll
 *     ticks) is wired in dedicated React components under src/app/, not
 *     here. This file is pure state.
 */
import { Atom } from "@effect-atom/atom-react";
import type { Annotation, Author } from "@/shared/types";

/** All annotations the daemon knows about, served on first WS snapshot. */
export const annotationsAtom = Atom.make<Annotation[]>([]).pipe(Atom.keepAlive);

/** id of the annotation whose ThreadCard is currently expanded, if any. */
export const activeIdAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive);

/** id under the cursor (host-doc hover). Drives the hover highlight. */
export const hoverIdAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive);

/** Range the user is currently composing a new comment over, or null. */
export const draftRangeAtom = Atom.make<Range | null>(null).pipe(Atom.keepAlive);

/** Live WebSocket status, for the connection dot. */
export const connectedAtom = Atom.make(false).pipe(Atom.keepAlive);

/**
 * Whether the right-edge column is expanded (full Track) or collapsed
 * (narrow Rail). See `WebSocketBridge` for the first-snapshot heuristic
 * that decides the initial value; otherwise the user owns this via the
 * close button on the track header and clicks on the rail.
 */
export const trackOpenAtom = Atom.make(false).pipe(Atom.keepAlive);

/**
 * Annotations whose selectors no longer resolve to any range in the
 * current doc DOM. A derived view, populated by the highlight-sync
 * effect as a side-product of its locate() calls. Never persisted.
 */
export const orphanedIdsAtom = Atom.make(new Set<string>()).pipe(
  Atom.keepAlive,
);

/**
 * Monotonic counter bumped on every iframe scroll/resize frame so any
 * atom or component that depends on anchor positions can rerender. Used
 * by the Track layout solver and SelectionPill. The atom itself carries
 * no useful value beyond "things may have moved".
 */
export const docTickAtom = Atom.make(0).pipe(Atom.keepAlive);

/**
 * The live iframe HTMLIFrameElement once loaded, or null. Set by
 * IframeDoc.tsx on its onLoad. Consumers read this to operate against
 * `iframe.contentDocument` / `contentWindow` (selection, anchoring,
 * scroll). Resets briefly to null on iframe reload (doc-changed).
 */
export const iframeElAtom = Atom.make<HTMLIFrameElement | null>(null).pipe(
  Atom.keepAlive,
);

/** Convenience: the iframe's live Document, or null. */
export const iframeDocAtom = Atom.make((get) => {
  // Re-read on every doc tick so callers see the freshest selection /
  // range coords after scroll. The element itself rarely changes.
  get(docTickAtom);
  const el = get(iframeElAtom);
  return el?.contentDocument ?? null;
});

/** The local human's identity, read from the SPA shell's <meta>. */
export const humanAuthorAtom = Atom.make<Author>(readHumanAuthor()).pipe(
  Atom.keepAlive,
);

function readHumanAuthor(): Author {
  if (typeof document === "undefined") return { kind: "human" };
  const meta = document.querySelector('meta[name="scribble-user"]');
  const raw = meta?.getAttribute("content");
  if (!raw) return { kind: "human" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === "human") {
      return parsed as Author;
    }
  } catch {}
  return { kind: "human" };
}

// ────────────────  Derived ────────────────

export const unresolvedAtom = Atom.make((get) =>
  get(annotationsAtom).filter((a) => a.status === "open"),
);

export const activeAnnotationAtom = Atom.make((get) => {
  const id = get(activeIdAtom);
  if (!id) return null;
  return get(annotationsAtom).find((a) => a.id === id) ?? null;
});
