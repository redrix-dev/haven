import type { ServerReportSummary } from "@shared/lib/backend/types";

export const reportsEqual = (
  a: ServerReportSummary[],
  b: ServerReportSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].reportId !== b[i].reportId || a[i].status !== b[i].status) {
      return false;
    }
  }
  return true;
};
