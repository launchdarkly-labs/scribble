/**
 * Thin wrapper around base-ui Tooltip. One JSX child becomes the
 * trigger; `label` becomes the popup text. `kbd` is optional and only
 * used when the action has a shortcut worth surfacing on hover.
 *
 * The Provider lives once at the App root so adjacent tooltips share an
 * open-delay / hot-zone — hovering across a row of icon buttons doesn't
 * make each one wait for its own delay.
 */
import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";

interface TipProps {
  label: React.ReactNode;
  /** Keyboard shortcut, one key per <kbd>. e.g. ["⌘", "Enter"]. */
  kbd?: string[];
  /** The trigger element. Receives Tooltip.Trigger's props via `render`. */
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}

export function Tip({
  label,
  kbd,
  children,
  side = "top",
  sideOffset = 6,
}: TipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={sideOffset}>
          <Tooltip.Popup className="tooltip">
            <span className="tooltip-label">{label}</span>
            {kbd && kbd.length > 0 && (
              <span className="tooltip-kbds">
                {kbd.map((k, i) => (
                  <kbd key={i}>{k}</kbd>
                ))}
              </span>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
