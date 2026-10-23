import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type {
  ReportCreatedBroadcastPayload,
  ReportStatusUpdatedBroadcastPayload,
  ServerReportDetail,
  ServerReportSummary,
  SupportReportStatus,
} from "@shared/lib/backend/types";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type CommunityModerationState = {
  reports: ServerReportSummary[];
  selectedReportId: string | null;
  detail: ServerReportDetail | null;
  isLoadingReports: boolean;
  isLoadingDetail: boolean;
  loadedCommunityIds: string[];
};

export const createInitialCommunityModerationState =
  (): CommunityModerationState => ({
    reports: [],
    selectedReportId: null,
    detail: null,
    isLoadingReports: false,
    isLoadingDetail: false,
    loadedCommunityIds: [],
  });

/** Statuses that count as an unhandled item in the modmail badge. */
const OPEN_STATUSES: readonly SupportReportStatus[] = [
  "pending",
  "under_review",
];

/** Unhandled reports across the loaded communities (the modmail badge). */
export function countOpenReports(
  reports: readonly ServerReportSummary[],
): number {
  return reports.filter((report) => OPEN_STATUSES.includes(report.status))
    .length;
}

/** Reports narrowed to one community and/or one status; "all" means no filter. */
export function filterReports(
  reports: ServerReportSummary[],
  communityId?: string,
  status?: SupportReportStatus | "all",
): ServerReportSummary[] {
  let filtered = reports;
  if (communityId && communityId !== "all") {
    filtered = filtered.filter((report) => report.communityId === communityId);
  }
  if (status && status !== "all") {
    filtered = filtered.filter((report) => report.status === status);
  }
  return filtered;
}

const ACKNOWLEDGE_NOTE =
  "Acknowledged: Haven Platform Moderation has acted on this report. No further community action required.";

/**
 * The community moderation inbox (server modmail).
 *
 * Community mods never see haven_staff rows — the backend filters to
 * destination='server_admins'. Platform action propagates through a DB
 * trigger that writes platform_action to the server_admins row, which arrives
 * here as a report_status_updated broadcast.
 */
export class CommunityModerationNexus {
  private readonly gate = createLoadGate();
  /** The scope of the load in flight, so a different scope replaces it. */
  private loadingScope: string | null = null;

  constructor(
    protected readonly port: StatePort<CommunityModerationState>,
    private readonly backend: ServerModmailBackend,
  ) {}

  /**
   * Load the inbox for the communities the viewer moderates. A narrower scope
   * (access revoked) drops the other communities' reports and selection at
   * once, and a load still fetching the wider scope stops writing.
   */
  load(communityIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(communityIds.filter(Boolean))).sort();
    const scope = uniqueIds.join(",");
    if (scope !== this.loadingScope) this.gate.forget("load");
    this.loadingScope = scope;
    this.narrowTo(uniqueIds);
    if (uniqueIds.length === 0) return Promise.resolve();

    return this.gate.run("load", async (stale) => {
      this.port.set({ isLoadingReports: true });
      try {
        const reports = await this.backend.listServerReports(uniqueIds);
        if (stale()) return;
        this.port.set({
          reports,
          loadedCommunityIds: uniqueIds,
          isLoadingReports: false,
        });
      } catch (err) {
        console.warn("[CommunityModerationNexus] load failed", err);
        if (stale()) return;
        this.port.set({ isLoadingReports: false });
      }
    });
  }

  async selectReport(reportId: string): Promise<void> {
    this.port.set({ selectedReportId: reportId, isLoadingDetail: true });
    try {
      const detail = await this.backend.getServerReport(reportId);
      // Selection moved or was cleared (scope narrowed) while we waited.
      if (this.port.get().selectedReportId !== reportId) return;
      this.port.set({ detail, isLoadingDetail: false });
    } catch (err) {
      console.warn("[CommunityModerationNexus] selectReport failed", err);
      if (this.port.get().selectedReportId !== reportId) return;
      this.port.set({ isLoadingDetail: false });
    }
  }

  clearSelection(): void {
    this.port.set({ selectedReportId: null, detail: null });
  }

  async updateStatus(
    reportId: string,
    status: SupportReportStatus,
  ): Promise<void> {
    await this.backend.updateReportStatus(reportId, status);
    this.setReportStatus(reportId, status);
    await this.refreshDetailIfSelected(reportId);
  }

  async addNote(reportId: string, body: string): Promise<void> {
    await this.backend.addInternalNote(reportId, body);
    await this.refreshDetailIfSelected(reportId);
  }

  async escalate(reportId: string): Promise<string> {
    const newReportId = await this.backend.escalateReport(reportId);
    this.setReportStatus(reportId, "escalated");
    await this.refreshDetailIfSelected(reportId);
    return newReportId;
  }

  /** A report resolved by platform action: note it and mark it resolved so it leaves the queue. */
  async acknowledge(reportId: string): Promise<void> {
    await this.backend.addInternalNote(reportId, ACKNOWLEDGE_NOTE);
    await this.updateStatus(reportId, "resolved");
  }

  /**
   * A new report arrived live. Only surface it when its community's inbox is
   * loaded and it isn't already listed — checked again after the fetch, since
   * a concurrent load or clear may have changed either.
   */
  async handleReportCreated(
    payload: ReportCreatedBroadcastPayload,
  ): Promise<void> {
    const { reportId, communityId } = payload;
    if (!this.shouldSurface(reportId, communityId)) return;
    try {
      const detail = await this.backend.getServerReport(reportId);
      if (!detail || !this.shouldSurface(reportId, communityId)) return;
      this.port.set({ reports: [detail, ...this.port.get().reports] });
    } catch (err) {
      console.warn(
        "[CommunityModerationNexus] handleReportCreated failed",
        err,
      );
    }
  }

  /** report_status_updated: community mod actions and platform action propagation alike. */
  handleReportChange(payload: ReportStatusUpdatedBroadcastPayload): void {
    this.setReportStatus(payload.reportId, payload.status);
    if (this.port.get().selectedReportId === payload.reportId) {
      void this.selectReport(payload.reportId);
    }
  }

  /**
   * USER_PLATFORM_BANNED. Linked reports already update through
   * handleReportChange via the DB trigger; unlinked-report handling waits until
   * haven-site emits this event.
   */
  handleUserPlatformBanned(_userId: string): void {}

  clear(): void {
    this.gate.clear();
    this.loadingScope = null;
    this.port.set(createInitialCommunityModerationState());
  }

  /** Drop reports, and the open report, from communities outside `scope`. */
  private narrowTo(scope: string[]): void {
    const { reports, loadedCommunityIds, selectedReportId, detail } =
      this.port.get();
    const inScope = (communityId: string) => scope.includes(communityId);
    const selectedCommunityId =
      detail?.communityId ??
      reports.find((report) => report.reportId === selectedReportId)
        ?.communityId;
    // A selection whose community isn't known yet stays unless nothing is in scope.
    const dropSelection =
      selectedReportId !== null &&
      (scope.length === 0 ||
        (selectedCommunityId !== undefined && !inScope(selectedCommunityId)));
    const keptReports = reports.filter((report) => inScope(report.communityId));
    const keptLoadedIds = loadedCommunityIds.filter(inScope);
    if (
      !dropSelection &&
      keptReports.length === reports.length &&
      keptLoadedIds.length === loadedCommunityIds.length
    ) {
      return;
    }
    this.port.set({
      reports: keptReports,
      loadedCommunityIds: keptLoadedIds,
      ...(dropSelection
        ? { selectedReportId: null, detail: null, isLoadingDetail: false }
        : {}),
    });
  }

  private shouldSurface(reportId: string, communityId: string): boolean {
    const { loadedCommunityIds, reports } = this.port.get();
    return (
      loadedCommunityIds.includes(communityId) &&
      !reports.some((report) => report.reportId === reportId)
    );
  }

  private setReportStatus(reportId: string, status: SupportReportStatus): void {
    this.port.set({
      reports: this.port
        .get()
        .reports.map((report) =>
          report.reportId === reportId ? { ...report, status } : report,
        ),
    });
  }

  private async refreshDetailIfSelected(reportId: string): Promise<void> {
    if (this.port.get().selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
  }
}
