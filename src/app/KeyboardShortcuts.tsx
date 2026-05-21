/**
 * App-level keyboard shortcuts that fire when focus is on the host page
 * (e.g., the user clicked on a chip in the track). For keystrokes that
 * happen *inside* the iframe, IframeDoc has its own listener since
 * keydown doesn't bubble across the iframe boundary.
 */
import { useEffect, useContext } from "react";
import {
  useAtomSet,
  RegistryContext,
} from "@effect-atom/atom-react";
import {
  activeIdAtom,
  draftRangeAtom,
  iframeElAtom,
  trackOpenAtom,
} from "./atoms";

export function KeyboardShortcuts() {
  const setActive = useAtomSet(activeIdAtom);
  const setDraftRange = useAtomSet(draftRangeAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const registry = useContext(RegistryContext);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K with iframe selection → start a draft. Mirrors the
      // iframe-side handler so the shortcut works regardless of where
      // focus is.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const iframe = registry.get(iframeElAtom);
        const doc = iframe?.contentDocument;
        const sel = doc?.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          e.preventDefault();
          setDraftRange(sel.getRangeAt(0).cloneRange());
          sel.removeAllRanges();
          setTrackOpen(true);
        }
      }
      if (e.key === "Escape") {
        if (registry.get(draftRangeAtom)) setDraftRange(null);
        else if (registry.get(activeIdAtom)) setActive(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActive, setDraftRange, setTrackOpen, registry]);

  return null;
}
