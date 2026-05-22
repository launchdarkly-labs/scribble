/**
 * Owns the iframe that displays the user's document and wires up all
 * the things scribble needs to do *inside* that iframe:
 *
 *   • Inject the highlight CSS into the iframe's <head> so the CSS
 *     Custom Highlight API rules render against text nodes there.
 *   • Forward selection / mousemove / click / scroll events from the
 *     iframe's contentDocument/Window to the app's state.
 *   • Publish the iframe element to iframeElAtom so other components
 *     (Track, SelectionPill, highlights sync) can do their thing.
 *   • Reload the iframe (not the whole app) when the daemon broadcasts
 *     doc-changed via WS — annotations survive without re-fetching.
 *
 * Same-origin assumption: the iframe loads /_scribble/doc from the same
 * daemon, so we can poke at contentDocument and contentWindow directly.
 * No postMessage gymnastics needed.
 */
import { useEffect, useRef } from "react";
import {
  useAtomSet,
  useAtomValue,
  RegistryContext,
} from "@effect-atom/atom-react";
import { useContext } from "react";
import {
  iframeElAtom,
  activeIdAtom,
  hoverIdAtom,
  draftRangeAtom,
  docTickAtom,
  annotationsAtom,
  trackOpenAtom,
} from "./atoms";
import { annotationAt } from "./highlights";

const DOC_HIGHLIGHT_CSS = `
:root {
  --scribble-accent: oklch(52% 0.32 264.84);
  --scribble-accent-soft: oklch(96% 0.025 264.84);
  --scribble-active-soft: oklch(92% 0.06 264.84);
  --scribble-resolved: oklch(70% 0.005 280);
}
@media (prefers-color-scheme: dark) {
  :root {
    --scribble-accent: oklch(72% 0.20 264.84);
    --scribble-accent-soft: oklch(28% 0.06 264.84);
    --scribble-active-soft: oklch(36% 0.10 264.84);
    --scribble-resolved: oklch(45% 0.005 280);
  }
}
::highlight(scribble-open) {
  background-color: var(--scribble-accent-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
::highlight(scribble-resolved) {
  text-decoration: underline;
  text-decoration-color: var(--scribble-resolved);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-style: dotted;
}
::highlight(scribble-active) {
  background-color: var(--scribble-active-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
::highlight(scribble-hover) {
  background-color: var(--scribble-active-soft);
}
::highlight(scribble-draft) {
  background-color: var(--scribble-active-soft);
  text-decoration: underline;
  text-decoration-color: var(--scribble-accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
`;

export function IframeDoc() {
  const ref = useRef<HTMLIFrameElement>(null);
  const setIframeEl = useAtomSet(iframeElAtom);
  const setDocTick = useAtomSet(docTickAtom);
  const setActiveId = useAtomSet(activeIdAtom);
  const setHoverId = useAtomSet(hoverIdAtom);
  const setDraftRange = useAtomSet(draftRangeAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const registry = useContext(RegistryContext);

  // Wire up the iframe on every (re)load — doc-changed reloads the
  // iframe in-place, so the contentDocument is fresh and we have to
  // re-inject styles and re-bind listeners.
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let cleanup: (() => void) | null = null;

    const onLoad = () => {
      cleanup?.();
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return;

      // Inject highlight CSS into the doc's head.
      const style = doc.createElement("style");
      style.setAttribute("data-scribble", "highlights");
      style.textContent = DOC_HIGHLIGHT_CSS;
      doc.head.appendChild(style);

      // Publish the iframe element to the atom AFTER load so consumers
      // who depend on the doc seeing it can do their setup. We publish
      // the *element* (not the doc); iframeDocAtom reads through it.
      setIframeEl(iframe);

      // Selection in the iframe → drives the SelectionPill.
      const onSelectionChange = () => {
        setDocTick((t) => t + 1);
      };
      doc.addEventListener("selectionchange", onSelectionChange);

      // rAF-throttled scroll/resize → bump docTick so anchored chips
      // in the Track follow the iframe scroll.
      let raf: number | null = null;
      const bump = () => {
        if (raf != null) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          setDocTick((t) => t + 1);
        });
      };
      win.addEventListener("scroll", bump, true);
      win.addEventListener("resize", bump);

      // Hover & click on annotated spans.
      let mraf = 0;
      let lastX = 0;
      let lastY = 0;
      const onMouseMove = (e: MouseEvent) => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (mraf) return;
        mraf = requestAnimationFrame(() => {
          mraf = 0;
          const list = registry.get(annotationsAtom);
          const id = annotationAt(lastX, lastY, list, doc);
          const cur = registry.get(hoverIdAtom);
          if (cur !== id) setHoverId(id);
          doc.body.style.cursor = id ? "pointer" : "";
        });
      };
      const onMouseLeave = () => {
        if (registry.get(hoverIdAtom) !== null) setHoverId(null);
        doc.body.style.cursor = "";
      };
      const onClick = (e: MouseEvent) => {
        const list = registry.get(annotationsAtom);
        const id = annotationAt(e.clientX, e.clientY, list, doc);
        if (id) {
          const cur = registry.get(activeIdAtom);
          const next = cur === id ? null : id;
          setActiveId(next);
          if (next) setTrackOpen(true);
          return;
        }
        // Click anywhere in the doc that isn't on an annotation:
        // dismiss whatever's focused (active thread or in-progress draft).
        if (registry.get(activeIdAtom)) setActiveId(null);
        if (registry.get(draftRangeAtom)) setDraftRange(null);
      };
      doc.addEventListener("mousemove", onMouseMove);
      doc.addEventListener("mouseleave", onMouseLeave);
      doc.addEventListener("click", onClick);

      // Keyboard inside the iframe: ⌘K starts a comment if there's a
      // selection, Esc cancels. The host app also listens for these,
      // but events that happen *inside* the iframe go through here.
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          const sel = doc.getSelection();
          if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
            e.preventDefault();
            setDraftRange(sel.getRangeAt(0).cloneRange());
            sel.removeAllRanges();
            setTrackOpen(true);
          }
        }
        if (e.key === "Escape") {
          if (registry.get(draftRangeAtom)) setDraftRange(null);
          else if (registry.get(activeIdAtom)) setActiveId(null);
        }
      };
      doc.addEventListener("keydown", onKeyDown);

      cleanup = () => {
        doc.removeEventListener("selectionchange", onSelectionChange);
        win.removeEventListener("scroll", bump, true);
        win.removeEventListener("resize", bump);
        doc.removeEventListener("mousemove", onMouseMove);
        doc.removeEventListener("mouseleave", onMouseLeave);
        doc.removeEventListener("click", onClick);
        doc.removeEventListener("keydown", onKeyDown);
        if (raf != null) cancelAnimationFrame(raf);
        if (mraf) cancelAnimationFrame(mraf);
        try {
          style.remove();
        } catch {}
      };
    };

    iframe.addEventListener("load", onLoad);
    // If the iframe is already loaded by the time React commits this
    // effect (cached navigations, fast localhost), onLoad won't fire.
    if (iframe.contentDocument?.readyState === "complete") onLoad();

    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup?.();
      setIframeEl(null);
    };
  }, [
    setIframeEl,
    setDocTick,
    setActiveId,
    setHoverId,
    setDraftRange,
    setTrackOpen,
    registry,
  ]);

  return (
    <iframe
      ref={ref}
      className="doc-frame"
      src="/_scribble/doc"
      title="Document"
    />
  );
}

/** Reload the iframe contents (called on WS doc-changed). */
export function useReloadIframe() {
  const iframe = useAtomValue(iframeElAtom);
  return () => {
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.location.reload();
    } catch {
      // Fallback: bounce the src (cross-origin reload would fail, but
      // we're same-origin so this branch is theoretical).
      iframe.src = iframe.src;
    }
  };
}
