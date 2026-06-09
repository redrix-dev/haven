import { createStore } from "solid-js/store";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

type HydrationPhase = "idle" | "hydrating" | "hydrated";

export type PermissionsSolidState = {
  permissionsByCommunityId: Record<string, ServerPermissions>;
  elevatedByCommunityId: Record<string, boolean>;
  hydrationByCommunityId: Record<string, HydrationPhase>;
  revokedAuthorIdsByCommunity: Record<string, Record<string, readonly string[]>>;
  revision: number;
};

/** Solid-native permissions cache — drives viewer message policy per community. */
export class PermissionsSolidCache {
  readonly state: PermissionsSolidState;
  readonly reactiveStore: NotifyingReadableStore<PermissionsSolidState>;
  private readonly setState: (
    updater: (
      state: PermissionsSolidState,
    ) => Partial<PermissionsSolidState> | PermissionsSolidState,
  ) => void;
  private readonly inflight = new Map<string, Promise<void>>();
  private policySync: ((communityId: string) => void) | null = null;

  constructor() {
    const [state, setState] = createStore<PermissionsSolidState>({
      permissionsByCommunityId: {},
      elevatedByCommunityId: {},
      hydrationByCommunityId: {},
      revokedAuthorIdsByCommunity: {},
      revision: 0,
    });
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setPolicySyncCallback(callback: ((communityId: string) => void) | null): void {
    this.policySync = callback;
  }

  getPermissions(communityId: string): ServerPermissions {
    return this.state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS;
  }

  isElevated(communityId: string): boolean {
    return this.state.elevatedByCommunityId[communityId] ?? false;
  }

  getRevokedAuthorIdsByChannel(
    communityId: string,
  ): Readonly<Record<string, readonly string[]>> {
    return this.state.revokedAuthorIdsByCommunity[communityId] ?? {};
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
      this.setState((s) => ({
        hydrationByCommunityId: {
          ...s.hydrationByCommunityId,
          [communityId]: "hydrating",
        },
      }));
      this.reactiveStore.notify();

      try {
        const result = await communityBackend.getMyPermissions(communityId);
        const { isElevated, ...permissions } = result;
        this.setState((s) => ({
          permissionsByCommunityId: {
            ...s.permissionsByCommunityId,
            [communityId]: permissions,
          },
          elevatedByCommunityId: {
            ...s.elevatedByCommunityId,
            [communityId]: isElevated,
          },
          hydrationByCommunityId: {
            ...s.hydrationByCommunityId,
            [communityId]: "hydrated",
          },
          revision: s.revision + 1,
        }));
        this.reactiveStore.notify();
        this.policySync?.(communityId);
      } catch (error) {
        console.error("[PermissionsSolidCache] ensureLoaded failed", error);
        this.setState((s) => ({
          hydrationByCommunityId: {
            ...s.hydrationByCommunityId,
            [communityId]: "idle",
          },
        }));
        this.reactiveStore.notify();
      }
    })().finally(() => {
      this.inflight.delete(communityId);
    });

    this.inflight.set(communityId, promise);
    return promise;
  }

  invalidate(communityId: string): void {
    this.setState((s) => {
      const { [communityId]: _p, ...permissionsByCommunityId } =
        s.permissionsByCommunityId;
      const { [communityId]: _e, ...elevatedByCommunityId } =
        s.elevatedByCommunityId;
      const { [communityId]: _h, ...hydrationByCommunityId } =
        s.hydrationByCommunityId;
      return {
        permissionsByCommunityId,
        elevatedByCommunityId,
        hydrationByCommunityId,
        revision: s.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  clear(): void {
    this.setState(() => ({
      permissionsByCommunityId: {},
      elevatedByCommunityId: {},
      hydrationByCommunityId: {},
      revokedAuthorIdsByCommunity: {},
      revision: 0,
    }));
    this.reactiveStore.notify();
  }
}

export function createPermissionsSolidCache(): PermissionsSolidCache {
  return new PermissionsSolidCache();
}
