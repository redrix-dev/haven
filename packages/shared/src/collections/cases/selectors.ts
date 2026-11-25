/** Views over `CasesState`, worked out when read. */

import type { PlatformCase } from "@shared/lib/backend/records";
import type { CasesState } from "./cases";

/** The queue as loaded, newest first. */
export function queuedCases(state: CasesState): PlatformCase[] {
  return (state.queue?.ids ?? []).flatMap((id) => {
    const found = state.byId[id];
    return found ? [found] : [];
  });
}
