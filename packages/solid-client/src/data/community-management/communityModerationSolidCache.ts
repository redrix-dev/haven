import type { ReportStatusUpdatedBroadcastPayload } from "@shared/lib/backend/types";

/** Solid-native community moderation cache stub for typecheck:solid. */
export class CommunityModerationSolidCache {
  handleReportChange(_payload: ReportStatusUpdatedBroadcastPayload): void {}

  handleUserPlatformBanned(_userId: string): void {}

  clear(): void {}
}
