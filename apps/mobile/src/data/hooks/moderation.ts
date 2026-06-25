import type { CommunityModerationNexus } from "../community-management/CommunityModerationNexus";
import type {
  ServerReportDetail,
  ServerReportSummary,
  SupportReportStatus,
} from "@shared/lib/backend/types";
import { reportsEqual } from "@shared/features/moderation/logic/equality";
import { useStoreSelector } from "./useStoreSelector";

export function useReports(
  nexus: CommunityModerationNexus,
  serverFilter?: string,
  statusFilter?: SupportReportStatus | "all",
): ServerReportSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => {
      void state.revision;
      let filtered = state.reports;
      if (serverFilter && serverFilter !== "all") {
        filtered = filtered.filter((r) => r.communityId === serverFilter);
      }
      if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
      return filtered;
    },
    reportsEqual,
  );
}

export function useSelectedReportId(
  nexus: CommunityModerationNexus,
): string | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.selectedReportId,
  );
}

export function useDetail(
  nexus: CommunityModerationNexus,
): ServerReportDetail | null {
  return useStoreSelector(nexus.reactiveStore, (state) => state.detail);
}

export function useIsLoadingReports(nexus: CommunityModerationNexus): boolean {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.isLoadingReports,
  );
}

export function useIsLoadingDetail(nexus: CommunityModerationNexus): boolean {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.isLoadingDetail,
  );
}
