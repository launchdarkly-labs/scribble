/**
 * Themed scroll container. Thin wrapper around base-ui ScrollArea so
 * callsites don't repeat the Root/Viewport/Scrollbar/Thumb dance.
 *
 * Styling lives in app.css under `.scroll-*` selectors. To add
 * padding/layout to a viewport, target `.<your-class> > .scroll-viewport`
 * rather than `.<your-class>` directly — the outer class lands on Root,
 * which is overflow: hidden.
 */
import * as React from "react";
import { ScrollArea } from "@base-ui-components/react/scroll-area";

export function Scroll({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <ScrollArea.Root className={`scroll-root ${className ?? ""}`}>
      <ScrollArea.Viewport className="scroll-viewport">
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scroll-scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
