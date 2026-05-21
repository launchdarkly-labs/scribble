/**
 * Two-way sync between `activeIdAtom` and `location.hash`.
 *
 * • Deep links: http://localhost:7878/#ann_01KS… opens scribble with
 *   that thread active.
 * • Survives reloads via the URL bar (no sessionStorage stash needed).
 * • Back/forward navigation feels right (replaceState, not pushState).
 *
 * activeId stays the source of truth in JS; this component just mirrors
 * it to the URL and listens for external hash changes (paste, browser
 * nav).
 *
 * Renders nothing. Mounted once at the top of the tree.
 */
import { useEffect, useContext } from "react";
import {
  useAtomSet,
  useAtomValue,
  RegistryContext,
} from "@effect-atom/atom-react";
import { activeIdAtom, trackOpenAtom } from "./atoms";

const PREFIX = "ann_";

function readHash(): string | null {
  const raw = location.hash.slice(1);
  return raw.startsWith(PREFIX) ? raw : null;
}

export function HashSync() {
  const setActive = useAtomSet(activeIdAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const id = useAtomValue(activeIdAtom);
  const registry = useContext(RegistryContext);

  // Mount: seed from URL hash and listen for external hash changes.
  useEffect(() => {
    const initial = readHash();
    if (initial) {
      setActive(initial);
      setTrackOpen(true); // Hash deep-links always open the track.
    }
    const onHashChange = () => {
      const next = readHash();
      if (registry.get(activeIdAtom) !== next) setActive(next);
      if (next) setTrackOpen(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setActive, setTrackOpen, registry]);

  // Mirror activeId → hash whenever it changes.
  useEffect(() => {
    const target = id ? `#${id}` : "";
    if (location.hash === target) return;
    if (!target && !location.hash) return;
    history.replaceState(
      null,
      "",
      target || location.pathname + location.search,
    );
  }, [id]);

  return null;
}
