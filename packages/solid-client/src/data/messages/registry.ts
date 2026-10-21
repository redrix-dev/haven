import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { CommunityMessageRegistry } from "@shared/nexus/community/communityMessageRegistry";
import { CommunityMessageSolidNexus } from "./communityMessageSolidNexus";

export type MessageSolidRegistry =
  CommunityMessageRegistry<CommunityMessageSolidNexus>;

export function createMessageSolidRegistry(
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): MessageSolidRegistry {
  return new CommunityMessageRegistry(
    (communityId) =>
      new CommunityMessageSolidNexus(
        communityId,
        persistence,
        viewerMessagePolicyStore,
      ),
  );
}
