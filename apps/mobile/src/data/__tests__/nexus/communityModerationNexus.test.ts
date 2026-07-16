import { describe, expect, it, vi } from "vitest";
import {
  createMemoryPersistence,
  routeRealtimeEvent,
  type RealtimeMutationTarget,
} from "@shared/core";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type {
  ServerReportDetail,
  ServerReportSummary,
} from "@shared/lib/backend/types";
import { CommunityModerationNexus } from "@mobile-data/community-management/CommunityModerationNexus";

const report = (
  reportId: string,
  communityId = "community-1",
): ServerReportSummary => ({
  reportId,
  communityId,
  serverName: "Test community",
  destination: "server_admins",
  status: "pending",
  title: `Report ${reportId}`,
  reportType: "message_report",
  createdAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
  reporterUserId: "reporter-1",
  reporterUsername: "Reporter",
  reporterAvatarUrl: null,
  snapshot: null,
});

const detail = (reportId: string): ServerReportDetail => ({
  ...report(reportId),
  notes: null,
  linkedChannels: [],
  linkedMessages: [],
  internalNotes: [],
  targetUserId: null,
  targetDisplayName: null,
  platformAction: null,
});

describe("CommunityModerationNexus", () => {
  it("prepends a live report for an already-loaded community", async () => {
    const getServerReport = vi.fn().mockResolvedValue(detail("report-new"));
    const backend = {
      listServerReports: vi.fn().mockResolvedValue([report("report-existing")]),
      getServerReport,
    } as unknown as ServerModmailBackend;
    const nexus = new CommunityModerationNexus(
      createMemoryPersistence(),
      backend,
    );

    await nexus.load(["community-1"]);
    await nexus.handleReportCreated({
      communityId: "community-1",
      reportId: "report-new",
    });

    expect(getServerReport).toHaveBeenCalledWith("report-new");
    expect(
      nexus.reactiveStore.getState().reports.map((item) => item.reportId),
    ).toEqual(["report-new", "report-existing"]);
  });

  it("ignores reports outside loaded communities and existing reports", async () => {
    const getServerReport = vi.fn().mockResolvedValue(detail("report-new"));
    const backend = {
      listServerReports: vi.fn().mockResolvedValue([report("report-existing")]),
      getServerReport,
    } as unknown as ServerModmailBackend;
    const nexus = new CommunityModerationNexus(
      createMemoryPersistence(),
      backend,
    );

    await nexus.load(["community-1"]);
    await nexus.handleReportCreated({
      communityId: "community-2",
      reportId: "report-new",
    });
    await nexus.handleReportCreated({
      communityId: "community-1",
      reportId: "report-existing",
    });

    expect(getServerReport).not.toHaveBeenCalled();
  });

  it("routes a report_created broadcast into the rendered report list", async () => {
    const backend = {
      listServerReports: vi.fn().mockResolvedValue([report("report-existing")]),
      getServerReport: vi.fn().mockResolvedValue(detail("report-live")),
    } as unknown as ServerModmailBackend;
    const nexus = new CommunityModerationNexus(
      createMemoryPersistence(),
      backend,
    );
    await nexus.load(["community-1"]);

    routeRealtimeEvent(
      { moderation: nexus } as unknown as RealtimeMutationTarget,
      {
        type: "report_created",
        payload: {
          community_id: "community-1",
          report_id: "report-live",
        },
      },
    );

    await vi.waitFor(() => {
      expect(
        nexus.reactiveStore.getState().reports.map((item) => item.reportId),
      ).toEqual(["report-live", "report-existing"]);
    });
  });
});
