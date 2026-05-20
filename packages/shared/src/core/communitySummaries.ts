import type { Community } from "@shared/nexus/community/CommunityNexus";
import type { ServerSummary } from "@shared/lib/backend/types";

export const toServerSummary = (community: Community): ServerSummary => ({
  id: community.id,
  name: community.name,
  created_at: community.createdAt,
});

export const toServerSummaries = (communities: Community[]): ServerSummary[] =>
  communities.map(toServerSummary);

export type CommunitiesLoadStatus = "idle" | "loading" | "success" | "error";

export function deriveCommunitiesLoadStatus(input: {
  hasUser: boolean;
  isLoading: boolean;
  loadError: string | null;
  communityCount: number;
}): CommunitiesLoadStatus {
  if (!input.hasUser) return "idle";
  if (input.isLoading) return "loading";
  if (input.loadError) return "error";
  return input.communityCount > 0 ? "success" : "idle";
}
