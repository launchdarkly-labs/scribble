/**
 * Opens the daemon WebSocket and dispatches snapshot / upsert / remove /
 * doc-changed events into atoms. Mounted once at the top of the React
 * tree; renders nothing.
 *
 * Reconnect: on close, schedule a reopen after 1s. The first snapshot
 * after each connection is treated as the authoritative source of truth
 * — earlier WS lifetime artifacts are dropped.
 *
 * First-snapshot heuristic for the (b) default: if the doc already has
 * any annotations on first ever connect, open the track. After that the
 * user owns it; later snapshots (after reconnect) don't override.
 */
import { useEffect, useContext } from "react";
import {
  useAtomSet,
  RegistryContext,
} from "@effect-atom/atom-react";
import {
  annotationsAtom,
  connectedAtom,
  activeIdAtom,
  trackOpenAtom,
} from "./atoms";
import { useReloadIframe } from "./IframeDoc";
import type { Annotation, WsMessage } from "@/shared/types";

export function WebSocketBridge() {
  const setAnnotations = useAtomSet(annotationsAtom);
  const setConnected = useAtomSet(connectedAtom);
  const setActive = useAtomSet(activeIdAtom);
  const setTrackOpen = useAtomSet(trackOpenAtom);
  const reloadIframe = useReloadIframe();
  const registry = useContext(RegistryContext);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let snapshotSeen = false;
    let closed = false;

    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/_scribble/ws`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        reconnectTimer = setTimeout(open, 1000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as WsMessage;
        if (msg.type === "doc-changed") {
          reloadIframe();
          return;
        }
        if (msg.type === "snapshot") {
          setAnnotations(msg.annotations);
          if (!snapshotSeen) {
            snapshotSeen = true;
            if (msg.annotations.length > 0) setTrackOpen(true);
          }
        } else if (msg.type === "upsert") {
          const current = registry.get(annotationsAtom);
          const isNew = !current.some((a) => a.id === msg.annotation.id);
          setAnnotations(upsert(current, msg.annotation));
          // Auto-open fresh agent-authored questions so the user sees them.
          if (
            isNew &&
            msg.annotation.author.kind === "agent" &&
            msg.annotation.status === "open"
          ) {
            setActive(msg.annotation.id);
            setTrackOpen(true);
          }
        } else if (msg.type === "remove") {
          const current = registry.get(annotationsAtom);
          setAnnotations(current.filter((a) => a.id !== msg.id));
        }
      };
    };

    open();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [
    setAnnotations,
    setConnected,
    setActive,
    setTrackOpen,
    reloadIframe,
    registry,
  ]);

  return null;
}

function upsert(list: Annotation[], next: Annotation): Annotation[] {
  const i = list.findIndex((a) => a.id === next.id);
  if (i === -1)
    return [...list, next].sort((a, b) => a.created.localeCompare(b.created));
  const copy = list.slice();
  copy[i] = next;
  return copy;
}
