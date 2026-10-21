import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { CommunityMessageRegistry } from "@shared/nexus/community/communityMessageRegistry";
import { CommunityMessageCache } from "./CommunityMessageCache";

export type MessageNexusRegistry =
  CommunityMessageRegistry<CommunityMessageCache>;

export function createCommunityMessageRegistry(
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): MessageNexusRegistry {
  return new CommunityMessageRegistry(
    (communityId) =>
      new CommunityMessageCache(
        communityId,
        persistence,
        viewerMessagePolicyStore,
      ),
  );
}
