import { createMemo, type Accessor } from "solid-js";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import type {
  ServerReportDetail,
  ServerReportSummary,
} from "@shared/lib/backend/types";
import {
  CommunityModerationNexus,
  countOpenReports,
  createInitialCommunityModerationState,
  type CommunityModerationState,
} from "@shared/nexus/community-management/communityModerationNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared CommunityModerationNexus. */
export class CommunityModerationSolidNexus extends CommunityModerationNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: CommunityModerationState;

  constructor(backend: ServerModmailBackend) {
    const port = createSolidStatePort(createInitialCommunityModerationState());
    super(port, backend);
    this.state = port.tracked;
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

  detailLoading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoadingDetail);
  }

  /** Unhandled reports across loaded communities (modmail badge). */
  openCount(): Accessor<number> {
    return createMemo(() => countOpenReports(this.state.reports));
  }
}
