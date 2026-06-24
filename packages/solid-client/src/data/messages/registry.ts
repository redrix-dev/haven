import type { HavenBackends } from "@shared/core/backends";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { CommunityMessageSolidNexus } from "./communityMessageSolidNexus";

export class MessageSolidRegistry {
  private readonly byCommunity = new Map<string, CommunityMessageSolidNexus>();
  private backends: HavenBackends | null = null;

  constructor(
    private readonly persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {}

  setBackends(backends: HavenBackends): void {
    this.backends = backends;
    for (const nexus of this.byCommunity.values()) {
      nexus.setCommunityData(backends.communityData);
    }
  }

  for(communityId: string): CommunityMessageSolidNexus {
    let nexus = this.byCommunity.get(communityId);
    if (!nexus) {
      nexus = new CommunityMessageSolidNexus(
        communityId,
        this.persistence,
        this.viewerMessagePolicyStore,
      );
      if (this.backends) {
        nexus.setCommunityData(this.backends.communityData);
      }
      nexus.rehydrate();
      this.byCommunity.set(communityId, nexus);
    }
    return nexus;
  }

  has(communityId: string): boolean {
    return this.byCommunity.has(communityId);
  }

  clearCommunity(communityId: string): void {
    const nexus = this.byCommunity.get(communityId);
    if (nexus) {
      nexus.clear();
      this.byCommunity.delete(communityId);
    }
  }

  clearAll(): void {
    for (const communityId of this.byCommunity.keys()) {
      this.clearCommunity(communityId);
    }
  }
}

export function createMessageSolidRegistry(
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): MessageSolidRegistry {
  return new MessageSolidRegistry(persistence, viewerMessagePolicyStore);
}
