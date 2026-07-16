import { create } from "zustand";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import type { StoreApi, UseBoundStore } from "zustand";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type {
  ReportCreatedBroadcastPayload,
  ReportStatusUpdatedBroadcastPayload,
  ServerReportDetail,
  ServerReportSummary,
  SupportReportStatus,
} from "@shared/lib/backend/types";
type CommunityModerationNexusState = {
  reports: ServerReportSummary[];
  selectedReportId: string | null;
  detail: ServerReportDetail | null;
  isLoadingReports: boolean;
  isLoadingDetail: boolean;
  loadedCommunityIds: string[];
  revision: number;
};

const EMPTY_REPORTS: ServerReportSummary[] = [];

/**
 * Owns the community moderation inbox (server modmail).
 *
 * Wraps ServerModmailBackend and exposes:
 *   - Reactive hooks for list + detail state
 *   - Deduped load(), selectReport(), and mutation methods
 *   - Realtime handlers called by routeRealtimeEvent
 *
 * Community mods never see haven_staff rows — the backend filters
 * to destination='server_admins' only. Platform action propagation
 * arrives via the DB trigger that writes platform_action to the
 * server_admins row, triggering a report_status_updated broadcast.
 */
export class CommunityModerationNexus {
  private readonly backend: ServerModmailBackend;
  private loadInflight: Promise<void> | null = null;

  private readonly store: UseBoundStore<
    StoreApi<CommunityModerationNexusState>
  >;

  get reactiveStore(): ReadableStore<CommunityModerationNexusState> {
    return this.store;
  }

  constructor(_persistence: NexusPersistence, backend: ServerModmailBackend) {
    void _persistence;
    this.backend = backend;
    this.store = create<CommunityModerationNexusState>()(() => ({
      reports: EMPTY_REPORTS,
      selectedReportId: null,
      detail: null,
      isLoadingReports: false,
      isLoadingDetail: false,
      loadedCommunityIds: [],
      revision: 0,
    }));
  }

  private bumpRevision(): void {
    this.store.setState((s) => ({ revision: s.revision + 1 }));
  }

  // ─── Load ───────────────────────────────────────────────────────────────────

  async load(communityIds: string[]): Promise<void> {
    if (this.loadInflight) return this.loadInflight;

    const uniqueIds = Array.from(new Set(communityIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      this.store.setState({ reports: EMPTY_REPORTS, loadedCommunityIds: [] });
      return;
    }

    this.store.setState({ isLoadingReports: true });

    const promise = (async () => {
      const reports = await this.backend.listServerReports(uniqueIds);
      this.store.setState({
        reports,
        loadedCommunityIds: uniqueIds,
        isLoadingReports: false,
      });
      this.bumpRevision();
    })()
      .catch((err) => {
        console.warn("[CommunityModerationNexus] load failed", err);
        this.store.setState({ isLoadingReports: false });
      })
      .finally(() => {
        this.loadInflight = null;
      });

    this.loadInflight = promise;
    return promise;
  }

  // ─── Selection ───────────────────────────────────────────────────────────────

  async selectReport(reportId: string): Promise<void> {
    this.store.setState({ selectedReportId: reportId, isLoadingDetail: true });
    try {
      const detail = await this.backend.getServerReport(reportId);
      this.store.setState({ detail, isLoadingDetail: false });
    } catch (err) {
      console.warn("[CommunityModerationNexus] selectReport failed", err);
      this.store.setState({ isLoadingDetail: false });
    }
  }

  clearSelection(): void {
    this.store.setState({ selectedReportId: null, detail: null });
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  async updateStatus(
    reportId: string,
    status: SupportReportStatus,
  ): Promise<void> {
    await this.backend.updateReportStatus(reportId, status);
    // Optimistic update in list
    this.store.setState((s) => ({
      reports: s.reports.map((r) =>
        r.reportId === reportId ? { ...r, status } : r,
      ),
    }));
    this.bumpRevision();
    // Refresh detail if currently selected
    if (this.store.getState().selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
  }

  async addNote(reportId: string, body: string): Promise<void> {
    await this.backend.addInternalNote(reportId, body);
    if (this.store.getState().selectedReportId === reportId) {
      await this.selectReport(reportId);
    }
  }

  async escalate(reportId: string): Promise<string> {
    const newReportId = await this.backend.escalateReport(reportId);
    // Optimistic update in list
    this.store.setState((s) => ({
      reports: s.reports.map((r) =>
        r.reportId === reportId
          ? { ...r, status: "escalated" as SupportReportStatus }
          : r,
      ),
    }));
    this.bumpRevision();
    if (this.store.getState().selectedReportId === reportId) {
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

  // ─── Realtime handlers ────────────────────────────────────────────────────────

  /**
   * Fetch and prepend a newly-created report when its community inbox is
   * already loaded. Re-check after the request so a concurrent load cannot
   * introduce a duplicate.
   */
  async handleReportCreated(
    payload: ReportCreatedBroadcastPayload,
  ): Promise<void> {
    const { reportId, communityId } = payload;
    const state = this.store.getState();
    if (!state.loadedCommunityIds.includes(communityId)) return;
    if (state.reports.some((report) => report.reportId === reportId)) return;

    try {
      const detail = await this.backend.getServerReport(reportId);
      if (!detail) return;
      const current = this.store.getState();
      if (!current.loadedCommunityIds.includes(communityId)) return;
      if (current.reports.some((report) => report.reportId === reportId))
        return;
      this.store.setState((latest) => ({
        reports: [detail, ...latest.reports],
      }));
      this.bumpRevision();
    } catch (err) {
      console.warn(
        "[CommunityModerationNexus] handleReportCreated failed",
        err,
      );
    }
  }

  /**
   * Called by routeRealtimeEvent when report_status_updated fires.
   * Covers both community mod actions AND platform action propagation
   * (DB trigger writes platform_action to server_admins row → status update broadcast).
   */
  handleReportChange(payload: ReportStatusUpdatedBroadcastPayload): void {
    const { reportId, status } = payload;
    this.store.setState((s) => ({
      reports: s.reports.map((r) =>
        r.reportId === reportId ? { ...r, status } : r,
      ),
    }));
    this.bumpRevision();
    // Re-fetch detail to pick up platform_action if this report is open
    if (this.store.getState().selectedReportId === reportId) {
      void this.selectReport(reportId);
    }
  }

  /**
   * Called by routeRealtimeEvent when USER_PLATFORM_BANNED fires.
   * For unlinked bans (no source_report_id), bumps revision so components
   * can re-evaluate available actions. The platform ban sweep sets
   * platform_expunged_at on messages — platform_action propagation via
   * the DB trigger handles linked reports automatically.
   */
  handleUserPlatformBanned(_userId: string): void {
    // Bump revision so hooks re-render with fresh data context.
    // Linked reports are handled by handleReportChange via the DB trigger.
    // Full unlinked-report handling is deferred until haven-site emits this event.
    this.bumpRevision();
  }

  rehydrate(): void {}

  clear(): void {
    this.store.setState({
      reports: EMPTY_REPORTS,
      selectedReportId: null,
      detail: null,
      isLoadingReports: false,
      isLoadingDetail: false,
      loadedCommunityIds: [],
      revision: 0,
    });
  }
}
