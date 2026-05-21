/**
 * App root: the two-column grid (iframe + track) and all the headless
 * components that drive state changes (WebSocket bridge, hash sync,
 * keyboard shortcuts, scroll coordination, highlight sync).
 *
 * Layout is plain CSS grid (see .app in app.css), with the right column
 * width driven by the `data-track` attribute on the root element. The
 * track itself just fills that grid cell.
 */
import { IframeDoc } from "./IframeDoc";
import { SelectionPill } from "./components/SelectionPill";
import { Track } from "./components/Track";
import { WebSocketBridge } from "./WebSocketBridge";
import { HashSync } from "./HashSync";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { HighlightSync } from "./HighlightSync";
import { ActivationScroller } from "./ActivationScroller";

export function App() {
  return (
    <div className="app">
      <IframeDoc />
      <Track />
      <SelectionPill />
      <WebSocketBridge />
      <HashSync />
      <KeyboardShortcuts />
      <HighlightSync />
      <ActivationScroller />
    </div>
  );
}
