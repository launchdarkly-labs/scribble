/**
 * App-level keyboard shortcut handler. Currently just ⌘K to start a
 * draft from a doc selection — a parallel of the iframe-side listener
 * in IframeDoc so the shortcut works regardless of where focus is.
 *
 * Esc is handled elsewhere:
 *   • inside the iframe → IframeDoc keydown listener
 *   • anywhere in the parent window → Drawer's onOpenChange with
 *     reason="escapeKey" (in Track.tsx), which dismisses focus state
 *     without collapsing the drawer
 * Don't handle Esc here too: it'd race with the Drawer's listener and
 * the drawer would close as a side effect.
 */
import { useEffect, useContext } from "react";
import { useAtomSet, RegistryContext } from "@effect-atom/atom-react";
import {
  draftRangeAtom,
  iframeElAtom,
  trackOpenAtom,
} from "./atoms";

export function KeyboardShortcuts() {
  const setDraftRange = useAtomSet(draftRangeAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const registry = useContext(RegistryContext);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setDraftRange, setTrackOpen, registry]);

  return null;
}
