/**
 * When the user activates an annotation or starts a draft, the track
 * needs to be visible — there's no point activating something the user
 * can't see. This is the centralized place for that policy. We never
 * auto-close.
 *
 * Renders nothing.
 */
import { useEffect } from "react";
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react";
import { activeIdAtom, draftRangeAtom, trackOpenAtom } from "./atoms";

export function AutoOpenTrack() {
  const activeId = useAtomValue(activeIdAtom);
  const draftRange = useAtomValue(draftRangeAtom);
  const setOpen = useAtomSet(trackOpenAtom);
  useEffect(() => {
    if (activeId || draftRange) setOpen(true);
  }, [activeId, draftRange, setOpen]);
  return null;
}
