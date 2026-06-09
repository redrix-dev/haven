import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type {
  Community,
  CommunityNexusState,
} from "@shared/nexus/community/communityTypes";
import { projectCommunities } from "@shared/nexus/community/communitySelectors";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import {
  applyCommunityDisplayOrder,
  clearCommunityDisplayOrder,
  hasSameIdSequence,
  readCommunityDisplayOrder,
  writeCommunityDisplayOrder,
} from "@shared/core/communityDisplayOrder";

const initialState = (): CommunityNexusState => ({
  entities: {},
  orderedIds: [],
  activeId: null,
  isLoading: false,
  loadError: null,
  displayOrderIds: null,
  revision: 0,
});

/** Solid-native community cache — calls shared selectors, no zustand. */
export class CommunitySolidCache {
  readonly state: CommunityNexusState;
  readonly reactiveStore: NotifyingReadableStore<CommunityNexusState>;
  private readonly setState: (
    updater: (
      state: CommunityNexusState,
    ) => Partial<CommunityNexusState> | CommunityNexusState,
  ) => void;
  private onListChanged: (() => void) | null = null;

  constructor(private readonly controlPlane: ControlPlaneBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setOnListChanged(listener: (() => void) | null): void {
    this.onListChanged = listener;
  }

  async load(userId: string): Promise<void> {
    this.setIsLoading(true);
    this.setLoadError(null);
    try {
      const list = await this.controlPlane.listUserCommunities(userId);
      this.setCommunities(
        list.map((community) => ({
          id: community.id,
          name: community.name,
          createdAt: community.created_at,
        })),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load communities.";
      this.setLoadError(message);
      throw error;
    } finally {
      this.setIsLoading(false);
    }
  }

  loadDisplayOrder(userId: string | null): void {
    if (!userId) {
      this.setDisplayOrderIds(null);
      return;
    }
    this.setDisplayOrderIds(readCommunityDisplayOrder(userId));
  }

  setCommunities(communities: Community[]): void {
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
    this.setState((s) => ({
      entities,
      orderedIds,
      isLoading: false,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
    this.onListChanged?.();
  }

  setDisplayOrder(ids: string[], userId: string | null): void {
    const communities = projectCommunities(this.state);
    const currentOrderedIds = applyCommunityDisplayOrder(
      communities,
      this.state.displayOrderIds,
    ).map((community) => community.id);
    if (hasSameIdSequence(currentOrderedIds, ids)) return;
    this.setDisplayOrderIds(ids);
    if (userId) writeCommunityDisplayOrder(userId, ids);
  }

  setActiveId(id: string | null): void {
    if (this.state.activeId === id) return;
    this.setState((s) => ({
      activeId: id,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  resetDisplayOrder(userId: string | null): void {
    this.setDisplayOrderIds(null);
    if (userId) clearCommunityDisplayOrder(userId);
  }

  getActiveId(): string | null {
    return this.state.activeId;
  }

  getIsLoading(): boolean {
    return this.state.isLoading;
  }

  getCommunityIds(): string[] {
    return this.state.orderedIds;
  }

  rehydrate(): void {}

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }

  private setDisplayOrderIds(ids: string[] | null): void {
    this.setState((s) => ({
      displayOrderIds: ids,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  private setIsLoading(loading: boolean): void {
    this.setState((s) => ({
      isLoading: loading,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  private setLoadError(error: string | null): void {
    this.setState((s) => ({
      loadError: error,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }
}

export function createCommunitySolidCache(
  controlPlane: ControlPlaneBackend,
): CommunitySolidCache {
  return new CommunitySolidCache(controlPlane);
}
