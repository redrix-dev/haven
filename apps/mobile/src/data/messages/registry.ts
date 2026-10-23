import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { CommunityMessageRegistry } from "@shared/nexus/messages/communityMessageRegistry";
import { CommunityMessageReactNexus } from "./communityMessageReactNexus";

export type MessageReactRegistry =
  CommunityMessageRegistry<CommunityMessageReactNexus>;

export function createCommunityMessageRegistry(
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): MessageReactRegistry {
  return new CommunityMessageRegistry(
    (communityId) =>
      new CommunityMessageReactNexus(
        communityId,
        persistence,
        viewerMessagePolicyStore,
      ),
  );
}
