/**
 * Theme: auto (system) | light | dark.
 *
 * We mirror the choice onto two attributes:
 *   1. The shadow-root host element  → drives :host([data-scribble-theme="…"]) in overlay.css
 *   2. document.documentElement      → drives :root[data-scribble-theme="…"] in host styles
 *
 * Both attributes are set so the overlay chrome and the in-doc ::highlight()
 * rules stay in sync without coordinating via JS.
 */
import { signal, effect } from "@preact/signals-react";

export type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "scribble:theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {}
  return "auto";
}

export const theme = signal<Theme>(readStored());

export function initTheme(hostEl: Element) {
  effect(() => {
    const t = theme.value;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    if (t === "auto") {
      hostEl.removeAttribute("data-scribble-theme");
      document.documentElement.removeAttribute("data-scribble-theme");
    } else {
      hostEl.setAttribute("data-scribble-theme", t);
      document.documentElement.setAttribute("data-scribble-theme", t);
    }
  });
}

export function cycleTheme() {
  theme.value = theme.value === "auto" ? "light" : theme.value === "light" ? "dark" : "auto";
}
