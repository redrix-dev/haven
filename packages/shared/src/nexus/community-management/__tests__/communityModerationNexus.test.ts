import { describe, expect, it } from "vitest";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type { ServerReportDetail } from "@shared/lib/backend/types";
import { createPlainStatePort } from "../../kit/statePort";
import {
  CommunityModerationNexus,
  createInitialCommunityModerationState,
} from "../communityModerationNexus";

const report = (reportId: string, communityId: string) =>
  ({ reportId, communityId, status: "pending" }) as ServerReportDetail;

/** A moderation nexus over a plain port; `reports` is the server's inbox. */
function moderationNexus(reports: ServerReportDetail[]) {
  const port = createPlainStatePort(createInitialCommunityModerationState());
  const backend = {
    listServerReports: async (communityIds: string[]) =>
      reports.filter((r) => communityIds.includes(r.communityId)),
    getServerReport: async (reportId: string) =>
      reports.find((r) => r.reportId === reportId) ?? null,
  } as unknown as ServerModmailBackend;
  return { nexus: new CommunityModerationNexus(port, backend), port };
}

describe("CommunityModerationNexus scope", () => {
  it("closes the open report when its community leaves the scope", async () => {
    const { nexus, port } = moderationNexus([
      report("r1", "c1"),
      report("r2", "c2"),
    ]);
    await nexus.load(["c1", "c2"]);
    await nexus.selectReport("r1");
    expect(port.get().detail?.reportId).toBe("r1");

    await nexus.load(["c2"]);

    expect(port.get()).toMatchObject({
      selectedReportId: null,
      detail: null,
      loadedCommunityIds: ["c2"],
    });
    expect(port.get().reports.map((r) => r.reportId)).toEqual(["r2"]);
  });

  it("closes everything when no community is left to moderate", async () => {
    const { nexus, port } = moderationNexus([report("r1", "c1")]);
    await nexus.load(["c1"]);
    await nexus.selectReport("r1");

    await nexus.load([]);

    expect(port.get()).toMatchObject({
      reports: [],
      selectedReportId: null,
      detail: null,
      loadedCommunityIds: [],
    });
  });

  it("keeps the open report when its community stays in scope", async () => {
    const { nexus, port } = moderationNexus([
      report("r1", "c1"),
      report("r2", "c2"),
    ]);
    await nexus.load(["c1", "c2"]);
    await nexus.selectReport("r1");

    await nexus.load(["c1"]);

    expect(port.get().detail?.reportId).toBe("r1");
  });

  it("a wider load still in flight can't bring back a dropped community", async () => {
    let answerWide!: () => void;
    const { nexus, port } = moderationNexus([
      report("r1", "c1"),
      report("r2", "c2"),
    ]);
    const backend = (nexus as unknown as { backend: ServerModmailBackend })
      .backend;
    const list = backend.listServerReports.bind(backend);
    backend.listServerReports = (ids) =>
      ids.length > 1
        ? new Promise((resolve) => {
            answerWide = () => void list(ids).then(resolve);
          })
        : list(ids);

    const wide = nexus.load(["c1", "c2"]);
    const narrow = nexus.load(["c2"]);
    answerWide();
    await Promise.all([wide, narrow]);

    expect(port.get().reports.map((r) => r.reportId)).toEqual(["r2"]);
    expect(port.get().loadedCommunityIds).toEqual(["c2"]);
  });

  it("a report still opening when its community leaves the scope stays closed", async () => {
    let answerDetail!: () => void;
    const { nexus, port } = moderationNexus([
      report("r1", "c1"),
      report("r2", "c2"),
    ]);
    const backend = (nexus as unknown as { backend: ServerModmailBackend })
      .backend;
    const get = backend.getServerReport.bind(backend);
    backend.getServerReport = (id) =>
      new Promise((resolve) => {
        answerDetail = () => void get(id).then(resolve);
      });
    await nexus.load(["c1", "c2"]);

    const opening = nexus.selectReport("r1");
    await nexus.load(["c2"]);
    answerDetail();
    await opening;

    expect(port.get()).toMatchObject({ selectedReportId: null, detail: null });
  });
});
