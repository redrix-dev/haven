import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/nexus/Nexus";
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type {
  Channel,
  ChannelGroupState,
} from "@shared/lib/backend/types";

const initialState = (): ChannelNexusState => ({
  entities: {},
  byCommunity: {},
  groups: {},
  ungrouped: {},
  collapsed: {},
  activeChannelId: null,
  loadingByCommunity: {},
  lastChannelByCommunity: {},
  revision: 0,
});

const toHavenChannel = (raw: Channel): HavenChannel => ({
  id: raw.id,
  communityId: raw.community_id,
  name: raw.name,
  kind: raw.kind,
  position: raw.position,
  topic: raw.topic,
  createdAt: raw.created_at,
});

/** Solid-native channel cache — calls shared selectors, no zustand. */
export class ChannelSolidCache {
  readonly state: ChannelNexusState;
  readonly reactiveStore: NotifyingReadableStore<ChannelNexusState>;
  private readonly setState: (
    updater: (
      state: ChannelNexusState,
    ) => Partial<ChannelNexusState> | ChannelNexusState,
  ) => void;

  constructor() {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setChannels(
    communityId: string,
    channels: Channel[],
    groupState: ChannelGroupState,
  ): void {
    const entities = { ...this.state.entities };
    const orderedIds: string[] = [];
    const sorted = [...channels].sort((a, b) => a.position - b.position);
    for (const raw of sorted) {
      const channel = toHavenChannel(raw);
      entities[raw.id] = {
        data: channel,
        partial: false,
        cachedAt: Date.now(),
      };
      orderedIds.push(raw.id);
    }
    this.setState((s) => ({
      entities,
      byCommunity: { ...s.byCommunity, [communityId]: orderedIds },
      groups: { ...s.groups, [communityId]: groupState.groups },
      ungrouped: {
        ...s.ungrouped,
        [communityId]: groupState.ungroupedChannelIds,
      },
      collapsed: {
        ...s.collapsed,
        [communityId]: groupState.collapsedGroupIds,
      },
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  setActiveChannelId(id: string | null): void {
    if (this.state.activeChannelId === id) return;
    this.setState((s) => ({
      activeChannelId: id,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }
}

export function createChannelSolidCache(): ChannelSolidCache {
  return new ChannelSolidCache();
}
