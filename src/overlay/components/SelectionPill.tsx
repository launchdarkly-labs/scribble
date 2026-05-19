import { useEffect, useState } from "react";
import { draftRange } from "../store";

/**
 * Watches the host document's text selection and shows a pill above it.
 * Clicking the pill stashes the Range and opens a comment card.
 */
export function SelectionPill() {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function onSelectionChange() {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Reject selections inside our own overlay
      const container =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      if (container?.closest("#scribble-root")) {
        setRect(null);
        return;
      }
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect(r);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  if (!rect) return null;

  const style: React.CSSProperties = {
    top: Math.max(8, rect.top - 36),
    left: rect.left + rect.width / 2,
    transform: "translateX(-50%)",
  };

  return (
    <button
      type="button"
      className="pill"
      style={style}
      // Use pointerdown so the host selection is still alive when we read it
      onPointerDown={(e) => {
        e.preventDefault();
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        draftRange.value = sel.getRangeAt(0).cloneRange();
        sel.removeAllRanges();
        setRect(null);
      }}
    >
      Comment
    </button>
  );
}
