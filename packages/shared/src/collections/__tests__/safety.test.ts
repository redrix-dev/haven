// Reports (the person's own, and a community's for its moderators) and
// Haven staff's cases.
import { describe, expect, it, vi } from "vitest";
import type { CaseFile } from "@shared/lib/backend/safety";
import type { PlatformCase } from "@shared/lib/backend/records";
import { Cases, CASE_PAGE, createCasesState } from "../cases/cases";
import { queuedCases } from "../cases/selectors";
import { createPlainStatePort } from "../kit/statePort";
import { createReportsState, Reports } from "../reports/reports";
import { communityReports, waitingReportCount } from "../reports/selectors";
import {
  communityReport,
  deferred,
  platformCase,
  reportNote,
  tid,
} from "./fixtures";

function reports() {
  const port = createPlainStatePort(createReportsState());
  const calls = {
    fileCommunityReport: vi.fn(async () => "r-new"),
    fileHavenReport: vi.fn(async () => "c-new"),
    listMyReports: vi.fn(async () => [
      {
        id: "r-mine",
        audience: "community",
        status: "open",
        created_at: "2026-11-14T12:00:00Z",
        updated_at: "2026-11-14T12:00:00Z",
      },
    ]),
    listDecisionsAboutMe: vi.fn(async () => []),
    listCommunityReports: vi.fn(async (communityId: string) =>
      communityId === "hearth"
        ? [
            communityReport(tid(3)),
            communityReport(tid(2), { status: "resolved" }),
            communityReport(tid(1), { status: "in_review" }),
          ]
        : [communityReport(tid(9), { community_id: communityId })],
    ),
    setCommunityReportStatus: vi.fn(async () => {}),
    listReportNotes: vi.fn(async (reportId: string) => [
      reportNote("n1", reportId),
    ]),
    addReportNote: vi.fn(async (reportId: string) =>
      reportNote("n2", reportId),
    ),
    escalateCommunityReport: vi.fn(async () => "c-1"),
  };
  return { port, calls, reports: new Reports(port, calls) };
}

describe("the person's own reports", () => {
  it("loads what they reported and the decisions about them", async () => {
    const { port, reports: r } = reports();
    expect(port.get().mine).toBeNull();
    await r.loadMine();
    expect(port.get().mine?.map((m) => m.id)).toEqual(["r-mine"]);
    expect(port.get().decisionsAboutMe).toEqual([]);
  });

  it("sends only what is reported and why, and loads their reports again", async () => {
    const { calls, reports: r } = reports();
    const subject = { kind: "message" as const, id: "m1" };
    expect(await r.fileCommunityReport("hearth", subject, "spam")).toBe(
      "r-new",
    );
    expect(calls.fileCommunityReport).toHaveBeenCalledWith(
      "hearth",
      subject,
      "spam",
    );
    expect(await r.fileHavenReport({ kind: "profile", id: "zed" })).toBe(
      "c-new",
    );
    expect(calls.listMyReports).toHaveBeenCalledTimes(2);
  });

  it("does not load again when filing is refused", async () => {
    const { calls, reports: r } = reports();
    calls.fileCommunityReport.mockRejectedValueOnce(new Error("rate_limited"));
    await expect(
      r.fileCommunityReport("hearth", { kind: "member", id: "zed" }),
    ).rejects.toThrow();
    expect(calls.listMyReports).not.toHaveBeenCalled();
  });
});

describe("a community's reports, for its moderators", () => {
  it("lists them newest first and counts the ones still waiting", async () => {
    const { port, reports: r } = reports();
    await r.loadCommunity("hearth");
    expect(communityReports(port.get(), "hearth").map((x) => x.id)).toEqual([
      tid(3),
      tid(2),
      tid(1),
    ]);
    expect(waitingReportCount(port.get(), "hearth")).toBe(2);
    expect(communityReports(port.get(), "elsewhere")).toEqual([]);
  });

  it("a reload drops reports the database no longer lists", async () => {
    const { port, calls, reports: r } = reports();
    await r.loadCommunity("hearth");
    calls.listCommunityReports.mockResolvedValueOnce([communityReport(tid(3))]);
    await r.loadCommunity("hearth");
    expect(Object.keys(port.get().byId)).toEqual([tid(3)]);
  });

  it("adds a new report to a loaded community only, once", async () => {
    const { port, reports: r } = reports();
    r.applyCreated(communityReport(tid(4)));
    expect(port.get().byId).toEqual({});
    await r.loadCommunity("hearth");
    r.applyCreated(communityReport(tid(4)));
    r.applyCreated(communityReport(tid(4)));
    expect(port.get().byCommunity.hearth).toEqual([
      tid(4),
      tid(3),
      tid(2),
      tid(1),
    ]);
  });

  it("shows the record an update carries, and loads an open report's notes again", async () => {
    const { port, calls, reports: r } = reports();
    await r.loadCommunity("hearth");
    await r.loadNotes(tid(3));
    calls.listReportNotes.mockResolvedValueOnce([
      reportNote("n1", tid(3)),
      reportNote("n3", tid(3)),
    ]);
    r.applyUpdated(communityReport(tid(3), { status: "in_review" }));
    expect(port.get().byId[tid(3)]?.status).toBe("in_review");
    await vi.waitFor(() =>
      expect(port.get().notes[tid(3)]?.map((n) => n.id)).toEqual(["n1", "n3"]),
    );
    // A report whose notes are not open loads nothing.
    r.applyUpdated(communityReport(tid(2), { status: "dismissed" }));
    expect(calls.listReportNotes).toHaveBeenCalledTimes(2);
  });

  it("an update for a report not held yet is a new one", async () => {
    const { port, reports: r } = reports();
    await r.loadCommunity("hearth");
    r.applyUpdated(communityReport(tid(5)));
    expect(port.get().byCommunity.hearth?.[0]).toBe(tid(5));
  });

  it("adds a note from the answer, and not twice when the reload has it", async () => {
    const { port, calls, reports: r } = reports();
    await r.loadNotes(tid(3));
    await r.addNote(tid(3), "looked at it");
    expect(calls.addReportNote).toHaveBeenCalledWith(tid(3), "looked at it");
    expect(port.get().notes[tid(3)]?.map((n) => n.id)).toEqual(["n1", "n2"]);
    calls.listReportNotes.mockResolvedValueOnce([
      reportNote("n1", tid(3)),
      reportNote("n2", tid(3)),
    ]);
    await r.loadNotes(tid(3));
    await r.addNote(tid(3), "again");
    expect(port.get().notes[tid(3)]?.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("status and escalation go to the database; the change comes back as an event", async () => {
    const { port, calls, reports: r } = reports();
    await r.loadCommunity("hearth");
    await r.setStatus(tid(3), "resolved");
    expect(calls.setCommunityReportStatus).toHaveBeenCalledWith(
      tid(3),
      "resolved",
    );
    expect(port.get().byId[tid(3)]?.status).toBe("open");
    expect(await r.escalate(tid(3), "threats")).toBe("c-1");
    expect(calls.escalateCommunityReport).toHaveBeenCalledWith(
      tid(3),
      "threats",
    );
  });

  it("forgets a community the person no longer moderates, and a notes load still out", async () => {
    const { port, calls, reports: r } = reports();
    await r.loadCommunity("hearth");
    await r.loadCommunity("other");
    await r.loadNotes(tid(2));
    const slow = deferred<ReturnType<typeof reportNote>[]>();
    calls.listReportNotes.mockReturnValueOnce(slow.promise);
    const notes = r.loadNotes(tid(3));
    r.forgetCommunity("hearth");
    slow.resolve([reportNote("n1", tid(3))]);
    await notes;
    const state = port.get();
    expect(Object.keys(state.byCommunity)).toEqual(["other"]);
    expect(Object.keys(state.byId)).toEqual([tid(9)]);
    expect(state.notes).toEqual({});
  });

  it("is empty after sign-out", async () => {
    const { port, reports: r } = reports();
    await r.loadMine();
    await r.loadCommunity("hearth");
    r.clear();
    expect(port.get()).toEqual(createReportsState());
  });
});

function caseFile(id: string, change: Partial<PlatformCase> = {}): CaseFile {
  return {
    case: platformCase(id, change),
    events: [],
    decisions: [],
    media: [{ case_id: id, media_id: "f1" }],
  };
}

function cases() {
  const port = createPlainStatePort(createCasesState());
  const calls = {
    listCases: vi.fn(
      async (options: { status?: string; before_id?: string } = {}) =>
        options.before_id
          ? [platformCase(tid(1))]
          : [platformCase(tid(3)), platformCase(tid(2))],
    ),
    loadCase: vi.fn(
      async (id: string): Promise<CaseFile | null> => caseFile(id),
    ),
    setCaseStatus: vi.fn(async () => {}),
    addCaseNote: vi.fn(async () => {}),
    recordDecision: vi.fn(async () => "d1"),
    reverseDecision: vi.fn(async () => {}),
    flagCsam: vi.fn(async () => {}),
    recordNcmecReport: vi.fn(async () => {}),
    viewCaseMedia: vi.fn(async () => "https://signed.example/f1"),
  };
  return { port, calls, cases: new Cases(port, calls) };
}

/** A full page, so the queue is not at its oldest. */
const fullPage = () =>
  Array.from({ length: CASE_PAGE }, (_, i) => platformCase(tid(1000 - i)));

describe("Haven staff's cases", () => {
  it("loads the queue of one status, and keeps that status on reload", async () => {
    const { port, calls, cases: c } = cases();
    await c.loadQueue("open");
    expect(calls.listCases).toHaveBeenCalledWith({
      status: "open",
      limit: CASE_PAGE,
    });
    expect(queuedCases(port.get()).map((x) => x.id)).toEqual([tid(3), tid(2)]);
    expect(port.get().queue?.atOldest).toBe(true);
    await c.loadQueue();
    expect(calls.listCases).toHaveBeenLastCalledWith({
      status: "open",
      limit: CASE_PAGE,
    });
    await c.loadQueue(null);
    expect(calls.listCases).toHaveBeenLastCalledWith({
      status: undefined,
      limit: CASE_PAGE,
    });
  });

  it("pages back through older cases until there are none", async () => {
    const { port, calls, cases: c } = cases();
    calls.listCases.mockResolvedValueOnce(fullPage());
    await c.loadQueue("open");
    await c.loadOlder();
    expect(calls.listCases).toHaveBeenLastCalledWith({
      status: "open",
      before_id: tid(1000 - CASE_PAGE + 1),
      limit: CASE_PAGE,
    });
    const ids = port.get().queue?.ids ?? [];
    expect(ids[ids.length - 1]).toBe(tid(1));
    expect(port.get().queue?.atOldest).toBe(true);
    await c.loadOlder();
    expect(calls.listCases).toHaveBeenCalledTimes(2);
  });

  it("drops an older page that arrives after the queue was loaded again", async () => {
    const { port, calls, cases: c } = cases();
    calls.listCases.mockResolvedValueOnce(fullPage());
    await c.loadQueue();
    const slow = deferred<PlatformCase[]>();
    calls.listCases.mockReturnValueOnce(slow.promise);
    const older = c.loadOlder();
    await c.loadQueue();
    slow.resolve([platformCase(tid(1))]);
    await older;
    expect(port.get().queue?.ids).toEqual([tid(3), tid(2)]);
  });

  it("opens a case file, and drops it from memory when closed", async () => {
    const { port, cases: c } = cases();
    await c.openCase(tid(3));
    expect(port.get().files[tid(3)]?.media).toEqual([
      { case_id: tid(3), media_id: "f1" },
    ]);
    expect(port.get().byId[tid(3)]?.id).toBe(tid(3));
    c.closeCase(tid(3));
    expect(port.get().files).toEqual({});
  });

  it("a case file still loading when closed is not kept", async () => {
    const { port, calls, cases: c } = cases();
    const slow = deferred<CaseFile | null>();
    calls.loadCase.mockReturnValueOnce(slow.promise);
    const opening = c.openCase(tid(3));
    c.closeCase(tid(3));
    slow.resolve(caseFile(tid(3)));
    await opening;
    expect(port.get().files).toEqual({});
  });

  it("a case the database no longer shows closes", async () => {
    const { port, calls, cases: c } = cases();
    await c.openCase(tid(3));
    calls.loadCase.mockResolvedValueOnce(null);
    await c.openCase(tid(3));
    expect(port.get().files).toEqual({});
  });

  it("case.changed loads the queue and that case's open file again, and nothing else", async () => {
    const { port, calls, cases: c } = cases();
    await c.loadQueue();
    await c.openCase(tid(3));
    await c.openCase(tid(2));
    calls.loadCase.mockResolvedValueOnce(
      caseFile(tid(3), { status: "actioned" }),
    );
    await c.applyChanged({ id: tid(3) });
    expect(calls.listCases).toHaveBeenCalledTimes(2);
    expect(calls.loadCase).toHaveBeenCalledTimes(3);
    expect(port.get().files[tid(3)]?.case.status).toBe("actioned");
    expect(port.get().byId[tid(3)]?.status).toBe("actioned");
  });

  it("before the queue is loaded, a change loads no queue", async () => {
    const { calls, cases: c } = cases();
    await c.applyChanged({ id: tid(7) });
    expect(calls.listCases).not.toHaveBeenCalled();
    expect(calls.loadCase).not.toHaveBeenCalled();
  });

  it("each command waits for the database's own record of it", async () => {
    const { calls, cases: c } = cases();
    await c.openCase(tid(3));
    const decision = { actions: ["user_banned" as const], rule: "1.2" };
    expect(await c.recordDecision(tid(3), decision)).toBe("d1");
    expect(calls.recordDecision).toHaveBeenCalledWith(tid(3), decision);
    await c.setStatus(tid(3), "in_review");
    expect(calls.setCaseStatus).toHaveBeenCalledWith(tid(3), "in_review");
    await c.addNote(tid(3), "seen");
    expect(calls.addCaseNote).toHaveBeenCalledWith(tid(3), "seen");
    await c.reverseDecision(tid(3), "d1", "wrong person");
    expect(calls.reverseDecision).toHaveBeenCalledWith("d1", "wrong person");
    await c.flagCsam(tid(3));
    expect(calls.flagCsam).toHaveBeenCalledWith(tid(3));
    await c.recordNcmecReport(tid(3), "NC-1");
    expect(calls.recordNcmecReport).toHaveBeenCalledWith(tid(3), "NC-1");
    // The open file, once per command, after opening it.
    expect(calls.loadCase).toHaveBeenCalledTimes(7);
  });

  it("a refused command loads nothing", async () => {
    const { calls, cases: c } = cases();
    await c.openCase(tid(3));
    calls.flagCsam.mockRejectedValueOnce(new Error("not_staff"));
    await expect(c.flagCsam(tid(3))).rejects.toThrow();
    expect(calls.loadCase).toHaveBeenCalledTimes(1);
  });

  it("hands back an evidence link without keeping it", async () => {
    const { port, calls, cases: c } = cases();
    await c.openCase(tid(3));
    expect(await c.viewMedia(tid(3), "f1")).toBe("https://signed.example/f1");
    expect(calls.viewCaseMedia).toHaveBeenCalledWith(tid(3), "f1");
    expect(JSON.stringify(port.get())).not.toContain("signed.example");
  });

  it("is empty after sign-out", async () => {
    const { port, cases: c } = cases();
    await c.loadQueue();
    await c.openCase(tid(3));
    c.clear();
    expect(port.get()).toEqual(createCasesState());
  });
});
