import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type { HavenBackends } from "@shared/core/backends";
import { CommunityMessageCache } from "./CommunityMessageCache";

export class MessageNexusRegistry {
  private byCommunity = new Map<string, CommunityMessageCache>();
  private backends: HavenBackends | null = null;

  constructor(
    private readonly persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {}

  setBackends(backends: HavenBackends): void {
    this.backends = backends;
    for (const cache of this.byCommunity.values()) {
      cache.setCommunityData(backends.communityData);
    }
  }

  for(communityId: string): CommunityMessageCache {
    let cache = this.byCommunity.get(communityId);
    if (!cache) {
      cache = new CommunityMessageCache(
        communityId,
        this.persistence,
        this.viewerMessagePolicyStore,
      );
      if (this.backends) cache.setCommunityData(this.backends.communityData);
      cache.rehydrate();
      this.byCommunity.set(communityId, cache);
    }
    return cache;
  }

  has(communityId: string): boolean {
    return this.byCommunity.has(communityId);
  }

  clearCommunity(communityId: string): void {
    const cache = this.byCommunity.get(communityId);
    if (cache) {
      cache.clear();
      this.byCommunity.delete(communityId);
    }
  }

  clearAll(): void {
    for (const [communityId] of this.byCommunity) {
      this.clearCommunity(communityId);
    }
  }
}

export function createCommunityMessageRegistry(
  persistence: NexusPersistence,
  viewerMessagePolicyStore: ViewerMessagePolicyStore,
): MessageNexusRegistry {
  return new MessageNexusRegistry(persistence, viewerMessagePolicyStore);
}
