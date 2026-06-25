import { createStore, type SetStoreFunction } from "solid-js/store";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";

type HydrationPhase = "idle" | "hydrating" | "hydrated";

export type PermissionsSolidState = {
  permissionsByCommunityId: Record<string, ServerPermissions>;
  elevatedByCommunityId: Record<string, boolean>;
  hydrationByCommunityId: Record<string, HydrationPhase>;
  revokedAuthorIdsByCommunity: Record<
    string,
    Record<string, readonly string[]>
  >;
};

const initialState = (): PermissionsSolidState => ({
  permissionsByCommunityId: {},
  elevatedByCommunityId: {},
  hydrationByCommunityId: {},
  revokedAuthorIdsByCommunity: {},
});

/** Solid-native permissions nexus — drives viewer message policy per community. */
export class PermissionsSolidNexus {
  readonly state: PermissionsSolidState;
  private readonly setState: SetStoreFunction<PermissionsSolidState>;
  private readonly inflight = new Map<string, Promise<void>>();
  private policySync: ((communityId: string) => void) | null = null;

  constructor() {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  setPolicySyncCallback(
    callback: ((communityId: string) => void) | null,
  ): void {
    this.policySync = callback;
  }

  getPermissions(communityId: string): ServerPermissions {
    return (
      this.state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS
    );
  }

  isElevated(communityId: string): boolean {
    return this.state.elevatedByCommunityId[communityId] ?? false;
  }

  getRevokedAuthorIds(
    communityId: string,
    channelId?: string,
  ): readonly string[] {
    const byChannel = this.state.revokedAuthorIdsByCommunity[communityId] ?? {};
    if (channelId) return byChannel[channelId] ?? [];
    return Object.values(byChannel).flat();
  }

  getRevokedAuthorIdsByChannel(
    communityId: string,
  ): Readonly<Record<string, readonly string[]>> {
    return this.state.revokedAuthorIdsByCommunity[communityId] ?? {};
  }

  appendRevokedAuthorId(
    communityId: string,
    channelId: string,
    revokedUserId: string,
  ): void {
    const byCommunity = this.state.revokedAuthorIdsByCommunity[communityId] ?? {};
    const existing = byCommunity[channelId] ?? [];
    if (existing.includes(revokedUserId)) return;
    this.setState("revokedAuthorIdsByCommunity", communityId, {
      ...byCommunity,
      [channelId]: [...existing, revokedUserId],
    });
    this.policySync?.(communityId);
  }

  getPermissionsByCommunityId(): Record<string, ServerPermissions> {
    return this.state.permissionsByCommunityId;
  }

  async ensureLoaded(
    communityId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<void> {
    if (this.state.hydrationByCommunityId[communityId] === "hydrated") {
      return;
    }

    const existing = this.inflight.get(communityId);
    if (existing) return existing;

    const promise = (async () => {
      this.setState("hydrationByCommunityId", communityId, "hydrating");

      try {
        const result = await communityBackend.getMyPermissions(communityId);
        const { isElevated, ...permissions } = result;
        this.setState("permissionsByCommunityId", communityId, permissions);
        this.setState("elevatedByCommunityId", communityId, isElevated);
        this.setState("hydrationByCommunityId", communityId, "hydrated");
        this.policySync?.(communityId);
      } catch (error) {
        console.error("[PermissionsSolidNexus] ensureLoaded failed", error);
        this.setState("hydrationByCommunityId", communityId, "idle");
      }
    })().finally(() => {
      this.inflight.delete(communityId);
    });

    this.inflight.set(communityId, promise);
    return promise;
  }

  async ensureElevated(
    communityId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<boolean> {
    await this.ensureLoaded(communityId, communityBackend);
    return this.isElevated(communityId);
  }

  async loadRevokedAuthorIdsForChannel(
    communityId: string,
    channelId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<void> {
    const ids = await communityBackend.listChannelRevokedUserIds({
      communityId,
      channelId,
    });
    this.setState("revokedAuthorIdsByCommunity", communityId, (byCommunity = {}) => ({
      ...byCommunity,
      [channelId]: ids,
    }));
    this.policySync?.(communityId);
  }

  invalidate(communityId: string): void {
    this.setState("permissionsByCommunityId", communityId, undefined!);
    this.setState("elevatedByCommunityId", communityId, undefined!);
    this.setState("hydrationByCommunityId", communityId, undefined!);
  }

  rehydrate(): void {}

  clear(): void {
    this.inflight.clear();
    this.setState(initialState());
  }
}

export function createPermissionsSolidNexus(): PermissionsSolidNexus {
  return new PermissionsSolidNexus();
}
