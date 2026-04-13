import type { HavenSupabaseClient } from "./createHavenSupabaseClient";
import type { ServerSummary } from "./backend/types";

type CommunityMemberCommunityRow = {
  communities: ServerSummary | null;
};

export async function listUserCommunitiesWithClient(
  client: HavenSupabaseClient,
  userId: string,
): Promise<ServerSummary[]> {
  const { data, error } = await client
    .from("community_members")
    .select("communities(id, name, created_at)")
    .eq("user_id", userId);

  if (error) throw error;

  return ((data ?? []) as CommunityMemberCommunityRow[])
    .map((item) => item.communities)
    .filter(
      (community): community is ServerSummary =>
        community !== null && community !== undefined,
    );
}
