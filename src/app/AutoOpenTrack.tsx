/**
 * When the user activates an annotation or starts a draft, the track
 * needs to be visible — there's no point activating something the user
 * can't see. This is the centralized place for that policy. We never
 * auto-close.
 *
 * Important: this only fires on *transitions* from null to non-null,
 * not on "is non-null right now." Otherwise the close button in the
 * track header would be defeated: closing the track while a thread is
 * still active would immediately re-open it on the next render (the
 * activation hasn't changed, but the effect would still see it as
 * "truthy" and call setOpen(true) again). Closing also clears the
 * activation itself — see the close handler in Track.tsx — so this
 * guard is belt-and-suspenders.
 *
 * Renders nothing.
 */
import { useEffect, useRef } from "react";
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react";
import { activeIdAtom, draftRangeAtom, trackOpenAtom } from "./atoms";

export function AutoOpenTrack() {
  const activeId = useAtomValue(activeIdAtom);
  const draftRange = useAtomValue(draftRangeAtom);
  const setOpen = useAtomSet(trackOpenAtom);
  const prevActive = useRef(activeId);
  const prevDraft = useRef(draftRange);
  useEffect(() => {
    const justActivated = !!activeId && !prevActive.current;
    const justDrafted = !!draftRange && !prevDraft.current;
    if (justActivated || justDrafted) setOpen(true);
    prevActive.current = activeId;
    prevDraft.current = draftRange;
  }, [activeId, draftRange, setOpen]);
  return null;
}
