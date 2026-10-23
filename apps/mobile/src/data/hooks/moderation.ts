import type { CommunityModerationReactNexus } from "../community-management/communityModerationReactNexus";
import { filterReports } from "@shared/nexus/community-management/communityModerationNexus";
import type {
  ServerReportDetail,
  ServerReportSummary,
  SupportReportStatus,
} from "@shared/lib/backend/types";
import { reportsEqual } from "@shared/features/moderation/logic/equality";
import { useStoreSelector } from "./useStoreSelector";

export function useReports(
  nexus: CommunityModerationReactNexus,
  serverFilter?: string,
  statusFilter?: SupportReportStatus | "all",
): ServerReportSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => filterReports(state.reports, serverFilter, statusFilter),
    reportsEqual,
  );
}

export function useSelectedReportId(
  nexus: CommunityModerationReactNexus,
): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.selectedReportId,
  );
}

export function useDetail(
  nexus: CommunityModerationReactNexus,
): ServerReportDetail | null {
  return useStoreSelector(nexus.reactiveStore, (state) => state.detail);
}

export function useIsLoadingReports(
  nexus: CommunityModerationReactNexus,
): boolean {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.isLoadingReports,
  );
}

export function useIsLoadingDetail(
  nexus: CommunityModerationReactNexus,
): boolean {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.isLoadingDetail,
  );
}
