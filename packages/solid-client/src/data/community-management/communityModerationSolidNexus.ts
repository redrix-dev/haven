import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type {
  ReportCreatedBroadcastPayload,
  ReportStatusUpdatedBroadcastPayload,
  ServerReportDetail,
  ServerReportSummary,
  SupportReportStatus,
} from "@shared/lib/backend/types";

/** Statuses that count as an unhandled item in the modmail badge. */
const OPEN_STATUSES: SupportReportStatus[] = ["pending", "under_review"];

const EMPTY_REPORTS: ServerReportSummary[] = [];

type CommunityModerationSolidState = {
  reports: ServerReportSummary[];
  selectedReportId: string | null;
  detail: ServerReportDetail | null;
  isLoadingReports: boolean;
  isLoadingDetail: boolean;
  loadedCommunityIds: string[];
};

const initialState = (): CommunityModerationSolidState => ({
  reports: EMPTY_REPORTS,
  selectedReportId: null,
  detail: null,
  isLoadingReports: false,
  isLoadingDetail: false,
  loadedCommunityIds: [],
});

/**
 * Owns the community moderation inbox (server modmail).
 *
 * Wraps ServerModmailBackend and exposes:
 *   - Reactive projections for list + detail state
 *   - Deduped load(), selectReport(), and mutation methods
 *   - Realtime handlers called by routeRealtimeEvent
 *
 * Community mods never see haven_staff rows — the backend filters
 * to destination='server_admins' only. Platform action propagation
 * arrives via the DB trigger that writes platform_action to the
 * server_admins row, triggering a report_status_updated broadcast.
 */
export class CommunityModerationSolidNexus {
  readonly state: CommunityModerationSolidState;
  private readonly setState: SetStoreFunction<CommunityModerationSolidState>;
  private loadInflight: Promise<void> | null = null;

  constructor(
    _persistence: NexusPersistence,
    private readonly backend: ServerModmailBackend,
  ) {
    void _persistence;
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  reports(): Accessor<ServerReportSummary[]> {
    return createMemo(() => this.state.reports);
  }

  selectedReportId(): Accessor<string | null> {
    return createMemo(() => this.state.selectedReportId);
  }

  reportDetail(): Accessor<ServerReportDetail | null> {
    return createMemo(() => this.state.detail);
  }

  reportsLoading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoadingReports);
  }

  /** Count of unhandled reports across loaded communities (modmail badge). */
  openCount(): Accessor<number> {
    return createMemo(
      () =>
        this.state.reports.filter((r) => OPEN_STATUSES.includes(r.status))
          .length,
    );
  }

  detailLoading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoadingDetail);
  }

  async load(communityIds: string[]): Promise<void> {
    if (this.loadInflight) return this.loadInflight;

    const uniqueIds = Array.from(new Set(communityIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      this.setState({ reports: EMPTY_REPORTS, loadedCommunityIds: [] });
      return;
    }

    this.setState("isLoadingReports", true);

    const promise = (async () => {
      const reports = await this.backend.listServerReports(uniqueIds);
      this.setState({
        reports,
        loadedCommunityIds: uniqueIds,
        isLoadingReports: false,
      });
    })()
      .catch((err) => {
        console.warn("[CommunityModerationSolidNexus] load failed", err);
        this.setState("isLoadingReports", false);
      })
      .finally(() => {
        this.loadInflight = null;
      });

    this.loadInflight = promise;
    return promise;
  }

  async selectReport(reportId: string): Promise<void> {
    this.setState({ selectedReportId: reportId, isLoadingDetail: true });
    try {
      const detail = await this.backend.getServerReport(reportId);
      this.setState({ detail, isLoadingDetail: false });
    } catch (err) {
      console.warn("[CommunityModerationSolidNexus] selectReport failed", err);
      this.setState("isLoadingDetail", false);
    }
  }

  clearSelection(): void {
    this.setState({ selectedReportId: null, detail: null });
  }

  async updateStatus(
    reportId: string,
    status: SupportReportStatus,
  ): Promise<void> {
    await this.backend.updateReportStatus(reportId, status);
    this.setState("reports", (reports) =>
      reports.map((r) => (r.reportId === reportId ? { ...r, status } : r)),
    );
    if (this.state.selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
  }

  async addNote(reportId: string, body: string): Promise<void> {
    await this.backend.addInternalNote(reportId, body);
    if (this.state.selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
  }

  async escalate(reportId: string): Promise<string> {
    const newReportId = await this.backend.escalateReport(reportId);
    this.setState("reports", (reports) =>
      reports.map((r) =>
        r.reportId === reportId
          ? { ...r, status: "escalated" as SupportReportStatus }
          : r,
      ),
    );
    if (this.state.selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
    return newReportId;
  }

  /**
   * Acknowledge a report that was resolved by platform action.
   * Adds a note and marks the report resolved so it leaves the active queue.
   */
  async acknowledge(reportId: string): Promise<void> {
    await this.backend.addInternalNote(
      reportId,
      "Acknowledged: Haven Platform Moderation has acted on this report. No further community action required.",
    );
    await this.updateStatus(reportId, "resolved");
  }

  /**
   * A new community report arrived live (report_created broadcast). Only act if
   * the report belongs to a community we currently moderate (i.e. it's loaded),
   * and isn't already present. Fetch the summary via the detail endpoint and
   * prepend it so the inbox surfaces it without a manual reload.
   */
  async handleReportCreated(
    payload: ReportCreatedBroadcastPayload,
  ): Promise<void> {
    const { reportId, communityId } = payload;
    if (!this.state.loadedCommunityIds.includes(communityId)) return;
    if (this.state.reports.some((r) => r.reportId === reportId)) return;
    try {
      const detail = await this.backend.getServerReport(reportId);
      if (!detail) return;
      // Re-check after the await — a concurrent load() may have added it.
      if (this.state.reports.some((r) => r.reportId === reportId)) return;
      this.setState("reports", (reports) => [detail, ...reports]);
    } catch (err) {
      console.warn(
        "[CommunityModerationSolidNexus] handleReportCreated failed",
        err,
      );
    }
  }

  handleReportChange(payload: ReportStatusUpdatedBroadcastPayload): void {
    const { reportId, status } = payload;
    this.setState("reports", (reports) =>
      reports.map((r) => (r.reportId === reportId ? { ...r, status } : r)),
    );
    if (this.state.selectedReportId === reportId) {
      void this.selectReport(reportId);
    }
  }

  handleUserPlatformBanned(_userId: string): void {
    void _userId;
    // Linked reports are handled by handleReportChange via the DB trigger.
    // Full unlinked-report handling is deferred until haven-site emits this event.
  }

  rehydrate(): void {}

  clear(): void {
    this.setState(initialState());
  }
}

export function createCommunityModerationSolidNexus(
  persistence: NexusPersistence,
  backend: ServerModmailBackend,
): CommunityModerationSolidNexus {
  return new CommunityModerationSolidNexus(persistence, backend);
}
