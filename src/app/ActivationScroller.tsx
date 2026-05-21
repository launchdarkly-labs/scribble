/**
 * When `activeIdAtom` changes, scroll the corresponding anchor element
 * in the iframe to the viewport center. Also auto-deselects when the
 * user scrolls the active anchor out of view.
 *
 * Replaces the old `dialog-coordinator.ts`. The key simplification: in
 * the in-track world there's no chip→full-card flicker to gate. The
 * chip stays in place when clicked; expansion is a same-position swap.
 * So we just scroll on activation and dismiss on scroll-out — no
 * `showThreadForId` settle-then-reveal dance.
 *
 * When activeId arrives via hash deep-link or WS auto-open of a new
 * agent question, the iframe doc may not have loaded yet. We retry
 * briefly until the anchor element is locatable.
 */
import { useEffect, useContext, useRef } from "react";
import {
  useAtomValue,
  useAtomSet,
  RegistryContext,
} from "@effect-atom/atom-react";
import { activeIdAtom, iframeElAtom, annotationsAtom } from "./atoms";
import { locate } from "./anchoring";

const DISMISS_GRACE_MS = 250;

export function ActivationScroller() {
  const id = useAtomValue(activeIdAtom);
  const iframe = useAtomValue(iframeElAtom);
  const setActive = useAtomSet(activeIdAtom);
  const registry = useContext(RegistryContext);
  const ioRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!id || !iframe?.contentDocument || !iframe.contentWindow) return;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    let attempts = 0;
    let cancelled = false;
    let dismissActive = false;

    const tryScroll = () => {
      if (cancelled) return;
      const list = registry.get(annotationsAtom);
      const ann = list.find((a) => a.id === id);
      if (!ann) {
        if (attempts++ < 20) setTimeout(tryScroll, 50);
        return;
      }
      const range = locate(ann.target.selector, doc);
      if (!range) {
        if (attempts++ < 5) setTimeout(tryScroll, 50);
        return;
      }
      const el =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer as Text).parentElement
          : (range.startContainer as Element);
      if (!el) return;

      el.scrollIntoView({ block: "center" });

      // Wait DISMISS_GRACE_MS before the IO is allowed to deactivate,
      // so the scroll-into-view doesn't dismiss the just-activated
      // annotation if it briefly leaves the viewport mid-scroll.
      const IO = (
        win as unknown as { IntersectionObserver: typeof IntersectionObserver }
      ).IntersectionObserver;
      ioRef.current = new IO((entries) => {
        if (!dismissActive) return;
        for (const entry of entries) {
          if (!entry.isIntersecting && registry.get(activeIdAtom) === id) {
            setActive(null);
          }
        }
      });
      ioRef.current.observe(el);
      setTimeout(() => {
        dismissActive = true;
      }, DISMISS_GRACE_MS);
    };

    tryScroll();

    return () => {
      cancelled = true;
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [id, iframe, setActive, registry]);

  return null;
}
