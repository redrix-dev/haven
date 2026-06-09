import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
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
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly communityData: CommunityDataBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  async loadForCommunity(communityId: string): Promise<void> {
    const existing = this.inflight.get(communityId);
    if (existing) return existing;

    const promise = (async () => {
      this.setIsLoading(communityId, true);
      try {
        const channels = await this.communityData.listChannels(communityId);
        let groupState: ChannelGroupState;
        try {
          groupState = await this.communityData.listChannelGroups({
            communityId,
            channelIds: channels.map((channel) => channel.id),
          });
        } catch {
          groupState = {
            groups: [],
            ungroupedChannelIds: channels.map((channel) => channel.id),
            collapsedGroupIds: [],
          };
        }
        this.setChannels(communityId, channels, groupState);
      } finally {
        this.setIsLoading(communityId, false);
        this.inflight.delete(communityId);
      }
    })();

    this.inflight.set(communityId, promise);
    return promise;
  }

  async ensureLoaded(communityId: string): Promise<void> {
    const ids = this.state.byCommunity[communityId] ?? [];
    if (ids.length > 0) return;
    await this.loadForCommunity(communityId);
  }

  upsertChannel(raw: Channel | unknown): void {
    const channel = toHavenChannel(raw as Channel);
    this.setState((s) => {
      const communityIds = s.byCommunity[channel.communityId] ?? [];
      const alreadyIndexed = communityIds.includes(channel.id);
      return {
        entities: {
          ...s.entities,
          [channel.id]: {
            data: channel,
            partial: false,
            cachedAt: Date.now(),
          },
        },
        byCommunity: alreadyIndexed
          ? s.byCommunity
          : {
              ...s.byCommunity,
              [channel.communityId]: [...communityIds, channel.id],
            },
        revision: s.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }

  removeChannel(id: string, communityId: string): void {
    this.setState((s) => {
      const { [id]: _, ...restEntities } = s.entities;
      const nextGroups = (s.groups[communityId] ?? []).map((group) => ({
        ...group,
        channelIds: group.channelIds.filter((channelId) => channelId !== id),
      }));
      return {
        entities: restEntities,
        byCommunity: {
          ...s.byCommunity,
          [communityId]: (s.byCommunity[communityId] ?? []).filter(
            (channelId) => channelId !== id,
          ),
        },
        groups: {
          ...s.groups,
          [communityId]: nextGroups,
        },
        ungrouped: {
          ...s.ungrouped,
          [communityId]: (s.ungrouped[communityId] ?? []).filter(
            (channelId) => channelId !== id,
          ),
        },
        revision: s.revision + 1,
      };
    });
    this.reactiveStore.notify();
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
        [communityId]: s.collapsed[communityId] ?? groupState.collapsedGroupIds,
      },
      loadingByCommunity: {
        ...s.loadingByCommunity,
        [communityId]: false,
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

  rehydrate(): void {}

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }

  private setIsLoading(communityId: string, loading: boolean): void {
    this.setState((s) => ({
      loadingByCommunity: {
        ...s.loadingByCommunity,
        [communityId]: loading,
      },
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }
}

export function createChannelSolidCache(
  communityData: CommunityDataBackend,
): ChannelSolidCache {
  return new ChannelSolidCache(communityData);
}
