import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/nexus/Nexus";
import type {
  Community,
  CommunityNexusState,
} from "@shared/nexus/community/communityTypes";
import { projectCommunities } from "@shared/nexus/community/communitySelectors";
import {
  applyCommunityDisplayOrder,
  clearCommunityDisplayOrder,
  hasSameIdSequence,
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

  constructor() {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
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
  }

  setDisplayOrder(ids: string[], userId: string | null): void {
    const communities = projectCommunities(this.state);
    const currentOrderedIds = applyCommunityDisplayOrder(
      communities,
      this.state.displayOrderIds,
    ).map((community) => community.id);
    if (hasSameIdSequence(currentOrderedIds, ids)) return;
    this.setState((s) => ({
      displayOrderIds: ids,
      revision: s.revision + 1,
    }));
    if (userId) writeCommunityDisplayOrder(userId, ids);
    this.reactiveStore.notify();
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
    this.setState((s) => ({
      displayOrderIds: null,
      revision: s.revision + 1,
    }));
    if (userId) clearCommunityDisplayOrder(userId);
    this.reactiveStore.notify();
  }
}

export function createCommunitySolidCache(): CommunitySolidCache {
  return new CommunitySolidCache();
}
