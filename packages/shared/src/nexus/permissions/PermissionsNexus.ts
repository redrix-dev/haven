import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";
import type { StoreApi, UseBoundStore } from "zustand";

const EMPTY_PERMISSIONS: ServerPermissions = {
  isOwner: false,
  canManageServer: false,
  canManageRoles: false,
  canManageMembers: false,
  canCreateChannels: false,
  canManageChannelStructure: false,
  canManageChannelPermissions: false,
  canManageMessages: false,
  canManageBans: false,
  canViewBanHidden: false,
  canCreateReports: false,
  canManageReports: false,
  canRefreshLinkPreviews: false,
  canManageInvites: false,
};

type HydrationPhase = "idle" | "hydrating" | "hydrated";

export type PermissionsNexusState = {
  permissionsByCommunityId: Record<string, ServerPermissions>;
  elevatedByCommunityId: Record<string, boolean>;
  hydrationByCommunityId: Record<string, HydrationPhase>;
  revokedAuthorIdsByCommunity: Record<
    string,
    Record<string, readonly string[]>
  >;
  revision: number;
};

export class PermissionsNexus {
  private readonly store: UseBoundStore<StoreApi<PermissionsNexusState>>;
  private inflight = new Map<string, Promise<void>>();
  private policySync: ((communityId: string) => void) | null = null;

  constructor(_persistence: NexusPersistence) {
    void _persistence;
    this.store = create<PermissionsNexusState>()(() => ({
      permissionsByCommunityId: {},
      elevatedByCommunityId: {},
      hydrationByCommunityId: {},
      revokedAuthorIdsByCommunity: {},
      revision: 0,
    }));
  }

  setPolicySyncCallback(
    callback: ((communityId: string) => void) | null,
  ): void {
    this.policySync = callback;
  }

  private bump(): void {
    this.store.setState((state) => ({ revision: state.revision + 1 }));
  }

  getPermissions(communityId: string): ServerPermissions {
    return (
      this.store.getState().permissionsByCommunityId[communityId] ??
      EMPTY_PERMISSIONS
    );
  }

  isElevated(communityId: string): boolean {
    return this.store.getState().elevatedByCommunityId[communityId] ?? false;
  }

  getRevokedAuthorIds(
    communityId: string,
    channelId?: string,
  ): readonly string[] {
    const byChannel =
      this.store.getState().revokedAuthorIdsByCommunity[communityId] ?? {};
    if (channelId) return byChannel[channelId] ?? [];
    return Object.values(byChannel).flat();
  }

  getRevokedAuthorIdsByChannel(
    communityId: string,
  ): Readonly<Record<string, readonly string[]>> {
    return (
      this.store.getState().revokedAuthorIdsByCommunity[communityId] ?? {}
    );
  }

  appendRevokedAuthorId(
    communityId: string,
    channelId: string,
    revokedUserId: string,
  ): void {
    this.store.setState((state) => {
      const byCommunity = state.revokedAuthorIdsByCommunity[communityId] ?? {};
      const existing = byCommunity[channelId] ?? [];
      if (existing.includes(revokedUserId)) return state;
      return {
        revokedAuthorIdsByCommunity: {
          ...state.revokedAuthorIdsByCommunity,
          [communityId]: {
            ...byCommunity,
            [channelId]: [...existing, revokedUserId],
          },
        },
      };
    });
    this.bump();
    this.policySync?.(communityId);
  }

  async ensureLoaded(
    communityId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<void> {
    if (
      this.store.getState().hydrationByCommunityId[communityId] === "hydrated"
    ) {
      return;
    }

    const existing = this.inflight.get(communityId);
    if (existing) return existing;

    const promise = (async () => {
      this.store.setState((state) => ({
        hydrationByCommunityId: {
          ...state.hydrationByCommunityId,
          [communityId]: "hydrating",
        },
      }));

      try {
        const result = await communityBackend.getMyPermissions(communityId);
        const { isElevated, ...permissions } = result;
        this.store.setState((state) => ({
          permissionsByCommunityId: {
            ...state.permissionsByCommunityId,
            [communityId]: permissions,
          },
          elevatedByCommunityId: {
            ...state.elevatedByCommunityId,
            [communityId]: isElevated,
          },
          hydrationByCommunityId: {
            ...state.hydrationByCommunityId,
            [communityId]: "hydrated",
          },
        }));
        this.bump();
        this.policySync?.(communityId);
      } catch (error) {
        console.error("[PermissionsNexus] ensureLoaded failed", error);
        this.store.setState((state) => ({
          hydrationByCommunityId: {
            ...state.hydrationByCommunityId,
            [communityId]: "idle",
          },
        }));
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
    this.store.setState((state) => ({
      revokedAuthorIdsByCommunity: {
        ...state.revokedAuthorIdsByCommunity,
        [communityId]: {
          ...(state.revokedAuthorIdsByCommunity[communityId] ?? {}),
          [channelId]: ids,
        },
      },
    }));
    this.bump();
    this.policySync?.(communityId);
  }

  invalidate(communityId: string): void {
    this.store.setState((state) => {
      const {
        [communityId]: _p,
        ...permissionsByCommunityId
      } = state.permissionsByCommunityId;
      const {
        [communityId]: _e,
        ...elevatedByCommunityId
      } = state.elevatedByCommunityId;
      const {
        [communityId]: _h,
        ...hydrationByCommunityId
      } = state.hydrationByCommunityId;
      return {
        permissionsByCommunityId,
        elevatedByCommunityId,
        hydrationByCommunityId,
        revision: state.revision + 1,
      };
    });
  }

  usePermissions(communityId: string): ServerPermissions {
    return useStoreWithEqualityFn(
      this.store,
      (state) =>
        state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS,
    );
  }

  usePermissionsByCommunityId(): Record<string, ServerPermissions> {
    return useStoreWithEqualityFn(this.store, (state) => {
      void state.revision;
      return state.permissionsByCommunityId;
    });
  }

  getPermissionsByCommunityId(): Record<string, ServerPermissions> {
    return this.store.getState().permissionsByCommunityId;
  }

  useIsElevated(communityId: string): boolean {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.elevatedByCommunityId[communityId] ?? false,
    );
  }

  rehydrate(): void {}

  clear(): void {
    this.store.setState({
      permissionsByCommunityId: {},
      elevatedByCommunityId: {},
      hydrationByCommunityId: {},
      revokedAuthorIdsByCommunity: {},
      revision: 0,
    });
  }
}
