/** Views over `ReportsState`, worked out when read. Both platforms use these. */

import type {
  CaseAction,
  CommunityReportRecord,
  DecisionAboutMe,
  MyReport,
} from "@shared/lib/backend/records";
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

// ── The person's own reports ──────────────────────────────────────────────
// One wording for both apps. A community report says it was reviewed, never
// what the moderators decided, as its notice does (REPORTING.md, "Notices").
// A Haven case says its outcome, with no detail about the other person.

/** Who a report went to. */
export const reportAudienceLabel = (report: MyReport): string =>
  report.audience === "haven" ? "Haven staff" : "Community moderators";

const COMMUNITY_STATUS: Record<string, string> = {
  open: "Received",
  in_review: "Being reviewed",
  resolved: "Reviewed",
  dismissed: "Reviewed",
  escalated: "Sent to Haven staff",
};

const CASE_STATUS: Record<string, string> = {
  open: "Received",
  in_review: "Being reviewed",
  actioned: "Action taken",
  no_action: "No violation found",
  dismissed: "Closed",
};

/** Where a report stands, in the words the person sees. */
export const reportStatusLabel = (report: MyReport): string =>
  (report.audience === "haven" ? CASE_STATUS : COMMUNITY_STATUS)[
    report.status
  ] ?? "Received";

const ACTION: Record<CaseAction, string> = {
  content_removed: "Content removed",
  user_suspended: "Account suspended",
  user_banned: "Account banned",
};

/** What a staff decision did, e.g. "Content removed, Account suspended". */
export const decisionActionsLabel = (decision: DecisionAboutMe): string =>
  decision.actions.map((action) => ACTION[action]).join(", ");
