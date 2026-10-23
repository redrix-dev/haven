import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type PermissionsBackend = Pick<
  CommunityDataBackend,
  "getMyPermissions" | "listChannelRevokedUserIds"
>;

type HydrationPhase = "idle" | "hydrating" | "hydrated";

export type PermissionsState = {
  permissionsByCommunityId: Record<string, ServerPermissions>;
  elevatedByCommunityId: Record<string, boolean>;
  hydrationByCommunityId: Record<string, HydrationPhase>;
  revokedAuthorIdsByCommunity: Record<
    string,
    Record<string, readonly string[]>
  >;
};

export const createInitialPermissionsState = (): PermissionsState => ({
  permissionsByCommunityId: {},
  elevatedByCommunityId: {},
  hydrationByCommunityId: {},
  revokedAuthorIdsByCommunity: {},
});

/**
 * The viewer's permissions per community, and the authors revoked from each
 * channel. This is UI-reflected truth — real enforcement is Postgres RLS.
 * Every change fires the policy-sync callback so the core can push a new
 * viewer message policy.
 */
export class PermissionsNexus {
  private readonly gate = createLoadGate();
  private policySync: ((communityId: string) => void) | null = null;

  constructor(
    protected readonly port: StatePort<PermissionsState>,
    private readonly backend: PermissionsBackend,
  ) {}

  setPolicySyncCallback(
    callback: ((communityId: string) => void) | null,
  ): void {
    this.policySync = callback;
  }

  getPermissions(communityId: string): ServerPermissions {
    return (
      this.port.get().permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS
    );
  }

  getPermissionsByCommunityId(): Record<string, ServerPermissions> {
    return this.port.get().permissionsByCommunityId;
  }

  isElevated(communityId: string): boolean {
    return this.port.get().elevatedByCommunityId[communityId] ?? false;
  }

  getRevokedAuthorIds(
    communityId: string,
    channelId?: string,
  ): readonly string[] {
    const byChannel =
      this.port.get().revokedAuthorIdsByCommunity[communityId] ?? {};
    if (channelId) return byChannel[channelId] ?? [];
    return Object.values(byChannel).flat();
  }

  getRevokedAuthorIdsByChannel(
    communityId: string,
  ): Readonly<Record<string, readonly string[]>> {
    return this.port.get().revokedAuthorIdsByCommunity[communityId] ?? {};
  }

  async ensureLoaded(communityId: string): Promise<void> {
    if (this.port.get().hydrationByCommunityId[communityId] === "hydrated") {
      return;
    }
    return this.gate.run(communityId, async (stale) => {
      this.setHydration(communityId, "hydrating");
      try {
        const { isElevated, ...permissions } =
          await this.backend.getMyPermissions(communityId);
        if (stale()) return;
        const state = this.port.get();
        this.port.set({
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
        });
        this.policySync?.(communityId);
      } catch (error) {
        console.error("[PermissionsNexus] ensureLoaded failed", error);
        if (stale()) return;
        this.setHydration(communityId, "idle");
      }
    });
  }

  async ensureElevated(communityId: string): Promise<boolean> {
    await this.ensureLoaded(communityId);
    return this.isElevated(communityId);
  }

  async loadRevokedAuthorIdsForChannel(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    const ids = await this.backend.listChannelRevokedUserIds({
      communityId,
      channelId,
    });
    this.setRevokedAuthorIds(communityId, channelId, ids);
  }

  appendRevokedAuthorId(
    communityId: string,
    channelId: string,
    revokedUserId: string,
  ): void {
    const existing = this.getRevokedAuthorIds(communityId, channelId);
    if (existing.includes(revokedUserId)) return;
    this.setRevokedAuthorIds(communityId, channelId, [
      ...existing,
      revokedUserId,
    ]);
  }

  /** Forget a community's permissions so the next ensureLoaded refetches them. */
  invalidate(communityId: string): void {
    const state = this.port.get();
    const { [communityId]: _p, ...permissionsByCommunityId } =
      state.permissionsByCommunityId;
    const { [communityId]: _e, ...elevatedByCommunityId } =
      state.elevatedByCommunityId;
    const { [communityId]: _h, ...hydrationByCommunityId } =
      state.hydrationByCommunityId;
    this.port.set({
      permissionsByCommunityId,
      elevatedByCommunityId,
      hydrationByCommunityId,
    });
  }

  clear(): void {
    this.gate.clear();
    this.port.set(createInitialPermissionsState());
  }

  private setHydration(communityId: string, phase: HydrationPhase): void {
    this.port.set({
      hydrationByCommunityId: {
        ...this.port.get().hydrationByCommunityId,
        [communityId]: phase,
      },
    });
  }

  private setRevokedAuthorIds(
    communityId: string,
    channelId: string,
    ids: readonly string[],
  ): void {
    const byCommunity = this.port.get().revokedAuthorIdsByCommunity;
    this.port.set({
      revokedAuthorIdsByCommunity: {
        ...byCommunity,
        [communityId]: {
          ...(byCommunity[communityId] ?? {}),
          [channelId]: ids,
        },
      },
    });
    this.policySync?.(communityId);
  }
}
