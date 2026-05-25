export type CommunityEntrypointTarget = {
  communityId: string | null;
  restoredActiveCommunity: boolean;
};

export function resolveCommunityEntrypointTarget(input: {
  communityIds: readonly string[];
  activeCommunityId: string | null;
}): CommunityEntrypointTarget {
  if (
    input.activeCommunityId &&
    input.communityIds.includes(input.activeCommunityId)
  ) {
    return {
      communityId: input.activeCommunityId,
      restoredActiveCommunity: true,
    };
  }

  return {
    communityId: input.communityIds[0] ?? null,
    restoredActiveCommunity: false,
  };
}
