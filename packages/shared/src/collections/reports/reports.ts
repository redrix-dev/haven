/**
 * Reports: what the person reported and the staff decisions about them, and,
 * for a community's moderators, that community's reports and their notes.
 * DATABASE.md: "Safety"; REPORTING.md for the product rules.
 *
 * The database writes the evidence when a report is filed, so filing sends
 * only what is reported and why. A report never says who filed it, and
 * nobody is shown a report about themselves; this holds what the database
 * hands over and nothing more.
 *
 * Moderators' lists stay current from `report.created` and `report.updated`
 * (a status change, a note, an escalation). The person's own reports have no
 * event: they load again after filing, on reconnect, and when a
 * `report_outcome` notification arrives (HavenCore).
 *
 * Nothing here is kept on the device: a report holds what was said, and that
 * can be removed by moderation.
 */

import type { SafetyBackend } from "@shared/lib/backend/safety";
import type {
  CaseSource,
  CommunityReportNote,
  CommunityReportRecord,
  DecisionAboutMe,
  MyReport,
  ReportStatus,
  ReportSubject,
} from "@shared/lib/backend/records";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

export type ReportsState = {
  /** Reports the person filed, newest first. Null until loaded. */
  mine: readonly MyReport[] | null;
  /** Staff decisions about the person, newest first. Null until loaded. */
  decisionsAboutMe: readonly DecisionAboutMe[] | null;
  /** Community reports the person moderates, by id. */
  byId: ById<CommunityReportRecord>;
  /** Each loaded community's reports, newest first. */
  byCommunity: Readonly<Record<string, readonly string[]>>;
  /** Notes on each report opened, oldest first. */
  notes: Readonly<Record<string, readonly CommunityReportNote[]>>;
  requests: RequestMap;
};

export const createReportsState = (): ReportsState => ({
  mine: null,
  decisionsAboutMe: null,
  byId: {},
  byCommunity: {},
  notes: {},
  requests: {},
});

export type ReportsBackendPart = Pick<
  SafetyBackend,
  | "fileCommunityReport"
  | "fileHavenReport"
  | "listMyReports"
  | "listDecisionsAboutMe"
  | "listCommunityReports"
  | "setCommunityReportStatus"
  | "listReportNotes"
  | "addReportNote"
  | "escalateCommunityReport"
>;

const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export class Reports {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<ReportsState>,
    private readonly backend: ReportsBackendPart,
  ) {
    this.requests = new Requests("reports", port);
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /** The person's own reports and the decisions about them. */
  loadMine(): Promise<void> {
    return this.requests.refresh("mine", async (stale) => {
      const [mine, decisionsAboutMe] = await Promise.all([
        this.backend.listMyReports(),
        this.backend.listDecisionsAboutMe(),
      ]);
      if (stale()) return;
      this.port.set({ mine, decisionsAboutMe });
    });
  }

  /** A community's reports, for its moderators. Refused without `manage_reports`. */
  loadCommunity(communityId: string): Promise<void> {
    return this.requests.refresh(`community:${communityId}`, async (stale) => {
      const reports = await this.backend.listCommunityReports(communityId);
      if (stale()) return;
      const state = this.port.get();
      const before = state.byCommunity[communityId] ?? [];
      this.port.set({
        byId: putRows(dropIds(state.byId, before), reports),
        byCommunity: {
          ...state.byCommunity,
          [communityId]: reports.map((report) => report.id),
        },
      });
    });
  }

  loadNotes(reportId: string): Promise<void> {
    return this.requests.refresh(`notes:${reportId}`, async (stale) => {
      const notes = await this.backend.listReportNotes(reportId);
      if (stale()) return;
      this.port.set({ notes: { ...this.port.get().notes, [reportId]: notes } });
    });
  }

  // ── Commands: anyone ──────────────────────────────────────────────────────

  /** To a community's moderators. Returns the report's id. */
  async fileCommunityReport(
    communityId: string,
    subject: { kind: ReportSubject; id: string },
    reason?: string,
  ): Promise<string> {
    const id = await this.backend.fileCommunityReport(
      communityId,
      subject,
      reason,
    );
    await this.loadMine();
    return id;
  }

  /** To Haven staff. Returns the case's id. */
  async fileHavenReport(
    subject: { kind: Extract<CaseSource, "message" | "profile">; id: string },
    reason?: string,
  ): Promise<string> {
    const id = await this.backend.fileHavenReport(subject, reason);
    await this.loadMine();
    return id;
  }

  // ── Commands: moderators ──────────────────────────────────────────────────
  // Each change comes back as `report.updated`, to every moderator, this one
  // included; the record in it is the one to show.

  setStatus(
    reportId: string,
    status: Exclude<ReportStatus, "escalated">,
  ): Promise<void> {
    return this.backend.setCommunityReportStatus(reportId, status);
  }

  async addNote(reportId: string, body: string): Promise<void> {
    const note = await this.backend.addReportNote(reportId, body);
    const held = this.port.get().notes[reportId] ?? [];
    if (held.some((n) => n.id === note.id)) return;
    this.port.set({
      notes: { ...this.port.get().notes, [reportId]: [...held, note] },
    });
  }

  /** Hands it to Haven staff, for good. Returns the case's id. */
  escalate(reportId: string, reason?: string): Promise<string> {
    return this.backend.escalateCommunityReport(reportId, reason);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** A new report, for a community whose list is loaded here. */
  applyCreated(report: CommunityReportRecord): void {
    const state = this.port.get();
    const list = state.byCommunity[report.community_id];
    if (!list || list.includes(report.id)) return;
    this.port.set({
      byId: putRows(state.byId, [report]),
      byCommunity: {
        ...state.byCommunity,
        [report.community_id]: [report.id, ...list].sort(newestFirst),
      },
    });
  }

  /**
   * A status, a note or an escalation. Notes are not in the event, so an
   * open report's notes load again.
   */
  applyUpdated(report: CommunityReportRecord): void {
    const state = this.port.get();
    if (!(report.id in state.byId)) {
      this.applyCreated(report);
      return;
    }
    this.port.set({ byId: putRows(state.byId, [report]) });
    if (report.id in state.notes) void this.loadNotes(report.id);
  }

  /**
   * The person no longer moderates this community (`access.changed` said
   * so, and the reload refused): what they held of it goes.
   */
  forgetCommunity(communityId: string): void {
    const state = this.port.get();
    const ids = state.byCommunity[communityId];
    if (!ids) return;
    const { [communityId]: _gone, ...byCommunity } = state.byCommunity;
    const notes = { ...state.notes };
    for (const id of ids) {
      delete notes[id];
      this.requests.forget(`notes:${id}`);
    }
    this.requests.forget(`community:${communityId}`);
    this.port.set({ byId: dropIds(state.byId, ids), byCommunity, notes });
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createReportsState());
  }
}
