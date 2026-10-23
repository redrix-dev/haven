import type { NexusEntry } from "@shared/core/cache/entityTypes";
import {
  applyCommunityDisplayOrder,
  clearCommunityDisplayOrder,
  hasSameIdSequence,
  readCommunityDisplayOrder,
  writeCommunityDisplayOrder,
} from "@shared/core/communityDisplayOrder";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { ServerSummary } from "@shared/lib/backend/types";
import { messageFromError } from "../kit/errors";
import { createLoadGate } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";
import { projectCommunities } from "./communitySelectors";
import type { Community, CommunityState } from "./communityTypes";

export type CommunityControlPlane = Pick<
  ControlPlaneBackend,
  "listUserCommunities"
>;

export const createInitialCommunityState = (): CommunityState => ({
  entities: {},
  orderedIds: [],
  activeId: null,
  isLoading: false,
  loadError: null,
  displayOrderIds: null,
});

export const toCommunity = (raw: ServerSummary): Community => ({
  id: raw.id,
  name: raw.name,
  createdAt: raw.created_at,
});

type PersistedCommunities = {
  entities: Record<string, NexusEntry<Community>>;
  orderedIds: string[];
  activeId: string | null;
};

/**
 * The communities the viewer belongs to, which one is active, and the
 * viewer's chosen display order. Persisted so the sidebar paints before the
 * network answers.
 */
export class CommunityNexus {
  private readonly gate = createLoadGate();
  private onMembershipLost: ((lost: Community[]) => void) | null = null;

  constructor(
    protected readonly port: StatePort<CommunityState>,
    private readonly persistence: NexusPersistence,
    private readonly controlPlane: CommunityControlPlane,
  ) {}

  /**
   * Called with the communities a server list no longer contains: the viewer
   * was kicked or banned, or the community was deleted, possibly while the app
   * was closed. A community removed locally (the viewer left it) is never
   * reported, because it is already gone before the list reloads.
   */
  setOnMembershipLost(listener: ((lost: Community[]) => void) | null): void {
    this.onMembershipLost = listener;
  }

  // ─── reads ─────────────────────────────────────────────────────────────────

  getActiveId(): string | null {
    return this.port.get().activeId;
  }

  getCommunityIds(): string[] {
    return this.port.get().orderedIds;
  }

  getCommunity(id: string): Community | undefined {
    return this.port.get().entities[id]?.data;
  }

  getIsLoading(): boolean {
    return this.port.get().isLoading;
  }

  // ─── loading ───────────────────────────────────────────────────────────────

  /**
   * Replace the list from the control plane. A failure is recorded in
   * `loadError` and re-thrown, so a create/join/leave that reloads can report
   * it; the session bootstrap catches it and carries on with the cached list.
   */
  load(userId: string): Promise<void> {
    return this.gate.run("load", async (stale) => {
      this.port.set({ isLoading: true, loadError: null });
      try {
        const list = await this.controlPlane.listUserCommunities(userId);
        if (stale()) return;
        this.setCommunities(list.map(toCommunity));
      } catch (error) {
        if (stale()) throw error;
        this.port.set({
          loadError: messageFromError(error, "Failed to load communities."),
        });
        throw error;
      } finally {
        this.port.set({ isLoading: false });
      }
    });
  }

  async ensureLoaded(userId: string): Promise<void> {
    if (this.port.get().orderedIds.length > 0) return;
    await this.load(userId);
  }

  // ─── writes ────────────────────────────────────────────────────────────────

  /** Replace the list with the server's; report any community it dropped. */
  setCommunities(communities: Community[]): void {
    const previous = this.port.get();
    const entities: Record<string, NexusEntry<Community>> = {};
    const orderedIds: string[] = [];
    for (const community of communities) {
      entities[community.id] = {
        data: community,
        partial: false,
        cachedAt: Date.now(),
      };
      orderedIds.push(community.id);
    }
    // Copied out before the write: on Solid `previous` is the live store,
    // and the write below removes these nodes.
    const lost = previous.orderedIds
      .filter((id) => !(id in entities))
      .flatMap((id) => {
        const community = previous.entities[id]?.data;
        return community ? [{ ...community }] : [];
      });
    this.port.set({ entities, orderedIds, isLoading: false });
    this.persist();
    if (lost.length > 0) this.onMembershipLost?.(lost);
  }

  removeCommunity(id: string): void {
    const state = this.port.get();
    const { [id]: _removed, ...entities } = state.entities;
    this.port.set({
      entities,
      orderedIds: state.orderedIds.filter((communityId) => communityId !== id),
      activeId: state.activeId === id ? null : state.activeId,
    });
    this.persist();
  }

  setActiveId(id: string | null): void {
    if (this.port.get().activeId === id) return;
    this.port.set({ activeId: id });
    this.persist();
  }

  // ─── display order (per user, in host storage) ─────────────────────────────

  loadDisplayOrder(userId: string | null): void {
    this.port.set({
      displayOrderIds: userId ? readCommunityDisplayOrder(userId) : null,
    });
  }

  setDisplayOrder(ids: string[], userId: string | null): void {
    const state = this.port.get();
    const currentOrderedIds = applyCommunityDisplayOrder(
      projectCommunities(state),
      state.displayOrderIds,
    ).map((community) => community.id);
    if (hasSameIdSequence(currentOrderedIds, ids)) return;

    this.port.set({ displayOrderIds: ids });
    if (userId) writeCommunityDisplayOrder(userId, ids);
  }

  resetDisplayOrder(userId: string | null): void {
    this.port.set({ displayOrderIds: null });
    if (userId) clearCommunityDisplayOrder(userId);
  }

  // ─── persistence + lifecycle ───────────────────────────────────────────────

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.communities);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedCommunities;
      this.port.set({
        entities: parsed.entities ?? {},
        orderedIds: parsed.orderedIds ?? [],
        activeId: parsed.activeId ?? null,
      });
    } catch (error) {
      console.warn("[CommunityNexus] Failed to rehydrate", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.communities);
    }
  }

  clear(): void {
    this.gate.clear();
    this.port.set(createInitialCommunityState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.communities);
  }

  private persist(): void {
    try {
      const state = this.port.get();
      const persisted: PersistedCommunities = {
        entities: Object.fromEntries(
          Object.entries(state.entities).filter(([, entry]) => !entry.partial),
        ),
        orderedIds: state.orderedIds,
        activeId: state.activeId,
      };
      this.persistence.set(
        NEXUS_STORAGE_KEYS.communities,
        JSON.stringify(persisted),
      );
    } catch (error) {
      console.warn("[CommunityNexus] Failed to persist", error);
    }
  }
}
