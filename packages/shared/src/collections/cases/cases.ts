/**
 * Cases: Haven staff's queue of platform cases, and the case files they have
 * open. DATABASE.md: "Safety"; REPORTING.md for the product rules.
 *
 * Only active staff read anything here; for anyone else every list is empty.
 * The database writes a case event for everything that happens to a case
 * and sends `case.changed` with its id to the staff who may read it, never to
 * the person it is about. That loads the queue again, and the case file if it
 * is open. Commands wait for that load, so the screen shows the database's
 * own record of what was done.
 *
 * Evidence is opened one file at a time (`viewMedia`), each view logged by
 * the database; the short-lived link it returns is not held here. Nothing
 * here is kept on the device, and a closed case file is dropped from memory.
 */

import type {
  CaseFile,
  Decision,
  SafetyBackend,
} from "@shared/lib/backend/safety";
import type { CaseStatus, PlatformCase } from "@shared/lib/backend/records";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** Cases per page of the queue. */
export const CASE_PAGE = 50;

export type CaseQueue = {
  /** Null: every status. */
  readonly status: CaseStatus | null;
  /** Newest first. */
  readonly ids: readonly string[];
  /** Nothing older exists. */
  readonly atOldest: boolean;
};

export type CasesState = {
  byId: ById<PlatformCase>;
  /** Null until the queue has loaded. */
  queue: CaseQueue | null;
  /** Open case files, by case id. */
  files: Readonly<Record<string, CaseFile>>;
  requests: RequestMap;
};

export const createCasesState = (): CasesState => ({
  byId: {},
  queue: null,
  files: {},
  requests: {},
});

export type CasesBackendPart = Pick<
  SafetyBackend,
  | "listCases"
  | "loadCase"
  | "setCaseStatus"
  | "addCaseNote"
  | "recordDecision"
  | "reverseDecision"
  | "flagCsam"
  | "recordNcmecReport"
  | "viewCaseMedia"
>;

export class Cases {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<CasesState>,
    private readonly backend: CasesBackendPart,
  ) {
    this.requests = new Requests("cases", port);
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /**
   * The newest page of the queue, of one status or all of them, replacing
   * what is held. With no status given, the one already shown.
   */
  loadQueue(status?: CaseStatus | null): Promise<void> {
    const wanted =
      status === undefined ? (this.port.get().queue?.status ?? null) : status;
    return this.requests.refresh("queue", async (stale) => {
      const page = await this.backend.listCases({
        status: wanted ?? undefined,
        limit: CASE_PAGE,
      });
      if (stale()) return;
      this.port.set({
        byId: putRows(this.port.get().byId, page),
        queue: {
          status: wanted,
          ids: page.map((c) => c.id),
          atOldest: page.length < CASE_PAGE,
        },
      });
    });
  }

  /** The page after the oldest case held. */
  loadOlder(): Promise<void> {
    const queue = this.port.get().queue;
    const oldest = queue?.ids[queue.ids.length - 1];
    if (!queue || queue.atOldest || !oldest) return Promise.resolve();
    return this.requests.run("older", async (stale) => {
      const page = await this.backend.listCases({
        status: queue.status ?? undefined,
        before_id: oldest,
        limit: CASE_PAGE,
      });
      const current = this.port.get().queue;
      if (stale() || current !== queue) return;
      this.port.set({
        byId: putRows(this.port.get().byId, page),
        queue: {
          ...queue,
          ids: [...new Set([...queue.ids, ...page.map((c) => c.id)])],
          atOldest: page.length < CASE_PAGE,
        },
      });
    });
  }

  /** Everything about one case: its events, decisions and evidence list. */
  openCase(caseId: string): Promise<void> {
    return this.requests.refresh(`case:${caseId}`, async (stale) => {
      const file = await this.backend.loadCase(caseId);
      if (stale()) return;
      const state = this.port.get();
      if (!file) {
        const { [caseId]: _gone, ...files } = state.files;
        this.port.set({ files });
        return;
      }
      this.port.set({
        byId: putRows(state.byId, [file.case]),
        files: { ...state.files, [caseId]: file },
      });
    });
  }

  /** Drops the case file from memory. The queue keeps its row. */
  closeCase(caseId: string): void {
    this.requests.forget(`case:${caseId}`);
    const { [caseId]: _gone, ...files } = this.port.get().files;
    this.port.set({ files });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  async setStatus(caseId: string, status: CaseStatus): Promise<void> {
    await this.backend.setCaseStatus(caseId, status);
    await this.reloadAfter(caseId);
  }

  async addNote(caseId: string, body: string): Promise<void> {
    await this.backend.addCaseNote(caseId, body);
    await this.reloadAfter(caseId);
  }

  /** Acts on the decision and tells the person. Returns the decision's id. */
  async recordDecision(caseId: string, decision: Decision): Promise<string> {
    const id = await this.backend.recordDecision(caseId, decision);
    await this.reloadAfter(caseId);
    return id;
  }

  async reverseDecision(
    caseId: string,
    decisionId: string,
    reason: string,
  ): Promise<void> {
    await this.backend.reverseDecision(decisionId, reason);
    await this.reloadAfter(caseId);
  }

  async flagCsam(caseId: string): Promise<void> {
    await this.backend.flagCsam(caseId);
    await this.reloadAfter(caseId);
  }

  async recordNcmecReport(caseId: string, reportId: string): Promise<void> {
    await this.backend.recordNcmecReport(caseId, reportId);
    await this.reloadAfter(caseId);
  }

  /** A link to one evidence file, good for a few minutes. Each view is logged. */
  viewMedia(caseId: string, mediaId: string): Promise<string> {
    return this.backend.viewCaseMedia(caseId, mediaId);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** Something happened to a case, or a new one was made. */
  applyChanged({ id }: { id: string }): Promise<void> {
    return this.reloadAfter(id);
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createCasesState());
  }

  private async reloadAfter(caseId: string): Promise<void> {
    const state = this.port.get();
    await Promise.all([
      state.queue ? this.loadQueue() : undefined,
      caseId in state.files ? this.openCase(caseId) : undefined,
    ]);
  }
}
