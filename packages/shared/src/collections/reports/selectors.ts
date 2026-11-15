/** Views over `ReportsState`, worked out when read. Both platforms use these. */

import type { CommunityReportRecord } from "@shared/lib/backend/records";
import type { ReportsState } from "./reports";

/** A community's reports, newest first. Empty until loaded. */
export function communityReports(
  state: ReportsState,
  communityId: string,
): CommunityReportRecord[] {
  return (state.byCommunity[communityId] ?? []).flatMap((id) => {
    const report = state.byId[id];
    return report ? [report] : [];
  });
}

/** Reports still waiting on a moderator: open or in review. For a badge. */
export const waitingReportCount = (
  state: ReportsState,
  communityId: string,
): number =>
  communityReports(state, communityId).filter(
    (report) => report.status === "open" || report.status === "in_review",
  ).length;
