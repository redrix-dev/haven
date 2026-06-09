import type { HavenBackends } from "@shared/core/backends";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import { CommunityMessageSolidCache } from "./communityMessageSolidCache";

export class MessageSolidRegistry {
  private readonly byCommunity = new Map<string, CommunityMessageSolidCache>();
  private backends: HavenBackends | null = null;

  constructor(
    private readonly _persistence: NexusPersistence,
    private readonly _viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {
    void this._persistence;
    void this._viewerMessagePolicyStore;
  }

  setBackends(backends: HavenBackends): void {
    this.backends = backends;
    for (const cache of this.byCommunity.values()) {
      cache.setCommunityData(backends.communityData);
    }
  }

  for(communityId: string): CommunityMessageSolidCache {
    let cache = this.byCommunity.get(communityId);
    if (!cache) {
      cache = new CommunityMessageSolidCache(communityId);
      if (this.backends) {
        cache.setCommunityData(this.backends.communityData);
      }
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
