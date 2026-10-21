import type { HavenBackends } from "@shared/core/backends";
import type { CommunityMessageNexus } from "./communityMessageNexus";

/**
 * One message nexus per community, created on first access.
 *
 * Generic over the nexus type so each platform gets its own subclass back —
 * the one carrying that platform's read bindings — while the bookkeeping here
 * is written once.
 */
export class CommunityMessageRegistry<
  N extends CommunityMessageNexus = CommunityMessageNexus,
> {
  private readonly byCommunity = new Map<string, N>();
  private backends: HavenBackends | null = null;

  constructor(private readonly createNexus: (communityId: string) => N) {}

  setBackends(backends: HavenBackends): void {
    this.backends = backends;
    for (const nexus of this.byCommunity.values()) {
      nexus.setCommunityData(backends.communityData);
    }
  }

  for(communityId: string): N {
    let nexus = this.byCommunity.get(communityId);
    if (!nexus) {
      nexus = this.createNexus(communityId);
      if (this.backends) nexus.setCommunityData(this.backends.communityData);
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
    if (!nexus) return;
    nexus.clear();
    this.byCommunity.delete(communityId);
  }

  clearAll(): void {
    for (const communityId of [...this.byCommunity.keys()]) {
      this.clearCommunity(communityId);
    }
  }
}
