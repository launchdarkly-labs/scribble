/**
 * Mounts the highlight-sync subscription once at the top of the React
 * tree. Renders nothing.
 *
 * The sync itself (and its registry subscriptions) lives in
 * src/app/highlights.ts so it can be tested or reused outside React.
 */
import { useEffect, useContext } from "react";
import { RegistryContext } from "@effect-atom/atom-react";
import { startHighlightSync } from "./highlights";

export function HighlightSync() {
  const registry = useContext(RegistryContext);
  useEffect(() => startHighlightSync(registry), [registry]);
  return null;
}
