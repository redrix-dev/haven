import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { createMMKV, type MMKV } from 'react-native-mmkv'
import { Nexus, type NexusEntry, type NexusState } from '../Nexus'
import type {
  Channel,
  ChannelGroup,
  ChannelGroupState,
  ChannelKind,
} from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

export type HavenChannel = {
  id: string
  communityId: string
  name: string
  kind: ChannelKind
  position: number
  topic: string | null
  createdAt: string
}

export type ChannelNexusState = NexusState<HavenChannel> & {
  byCommunity: Record<string, string[]>
  groups: Record<string, ChannelGroup[]>
  ungrouped: Record<string, string[]>
  collapsed: Record<string, string[]>
  activeChannelId: string | null
  loadingByCommunity: Record<string, boolean>
}

const STORAGE_KEY = 'haven:nexus:channels:global'
const EMPTY_CHANNELS: HavenChannel[] = []

let sharedNexusStorage: MMKV | null = null

function getSharedNexusStorage(): MMKV {
  if (!sharedNexusStorage) {
    sharedNexusStorage = createMMKV({ id: 'haven-nexus-storage' })
  }
  return sharedNexusStorage
}

const selectActiveChannelId = (state: ChannelNexusState) => state.activeChannelId

export const channelsEqual = (a: HavenChannel[], b: HavenChannel[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].name !== b[i].name ||
      a[i].position !== b[i].position
    ) {
      return false
    }
  }
  return true
}

export const groupStateEqual = (
  a: ChannelGroupState,
  b: ChannelGroupState,
): boolean =>
  a.groups.length === b.groups.length &&
  a.ungroupedChannelIds.length === b.ungroupedChannelIds.length &&
  a.collapsedGroupIds.length === b.collapsedGroupIds.length

export class ChannelNexus extends Nexus<HavenChannel, Channel> {
  private _channelStore: UseBoundStore<StoreApi<ChannelNexusState>> | null =
    null

  private channelSelectors = new Map<
    string,
    (state: ChannelNexusState) => HavenChannel | undefined
  >()

  private channelsSelectors = new Map<
    string,
    (state: ChannelNexusState) => HavenChannel[]
  >()

  private groupsSelectors = new Map<
    string,
    (state: ChannelNexusState) => ChannelGroupState
  >()

  private loadingSelectors = new Map<
    string,
    (state: ChannelNexusState) => boolean
  >()

  private channelsSnapshots = new Map<string, HavenChannel[]>()
  private groupStateSnapshots = new Map<string, ChannelGroupState>()

  constructor() {
    super('channels', 'global', getSharedNexusStorage())
  }

  protected transform(raw: Channel): HavenChannel {
    return {
      id: raw.id,
      communityId: raw.community_id,
      name: raw.name,
      kind: raw.kind,
      position: raw.position,
      topic: raw.topic,
      createdAt: raw.created_at,
    }
  }

  protected override get store(): UseBoundStore<StoreApi<ChannelNexusState>> {
    if (!this._channelStore) {
      this._channelStore = create<ChannelNexusState>(() => ({
        entities: {},
        byCommunity: {},
        groups: {},
        ungrouped: {},
        collapsed: {},
        activeChannelId: null,
        loadingByCommunity: {},
        revision: 0,
      }))
      this.rehydrate()
    }
    return this._channelStore
  }

  private getChannelSelector(
    id: string,
  ): (state: ChannelNexusState) => HavenChannel | undefined {
    if (!this.channelSelectors.has(id)) {
      this.channelSelectors.set(id, (state) => state.entities[id]?.data)
    }
    return this.channelSelectors.get(id)!
  }

  private getChannelsSelector(
    communityId: string,
  ): (state: ChannelNexusState) => HavenChannel[] {
    if (!this.channelsSelectors.has(communityId)) {
      this.channelsSelectors.set(communityId, (state) => {
        void state.revision
        const ids = state.byCommunity[communityId]
        if (!ids?.length) return EMPTY_CHANNELS

        const channels: HavenChannel[] = []
        for (const id of ids) {
          const entry = state.entities[id]
          if (entry && !entry.partial) {
            channels.push(entry.data)
          }
        }

        const cached = this.channelsSnapshots.get(communityId)
        if (cached && channelsEqual(cached, channels)) {
          return cached
        }

        this.channelsSnapshots.set(communityId, channels)
        return channels
      })
    }
    return this.channelsSelectors.get(communityId)!
  }

  private getGroupsSelector(
    communityId: string,
  ): (state: ChannelNexusState) => ChannelGroupState {
    if (!this.groupsSelectors.has(communityId)) {
      this.groupsSelectors.set(communityId, (state) => {
        void state.revision
        const next: ChannelGroupState = {
          groups: state.groups[communityId] ?? [],
          ungroupedChannelIds: state.ungrouped[communityId] ?? [],
          collapsedGroupIds: state.collapsed[communityId] ?? [],
        }

        const cached = this.groupStateSnapshots.get(communityId)
        if (cached && groupStateEqual(cached, next)) {
          return cached
        }

        this.groupStateSnapshots.set(communityId, next)
        return next
      })
    }
    return this.groupsSelectors.get(communityId)!
  }

  private getLoadingSelector(
    communityId: string,
  ): (state: ChannelNexusState) => boolean {
    if (!this.loadingSelectors.has(communityId)) {
      this.loadingSelectors.set(
        communityId,
        (state) => state.loadingByCommunity[communityId] ?? false,
      )
    }
    return this.loadingSelectors.get(communityId)!
  }

  setChannels(
    communityId: string,
    channels: Channel[],
    groupState: ChannelGroupState,
  ): void {
    const entities = { ...this.store.getState().entities }
    const orderedIds: string[] = []
    const sorted = [...channels].sort((a, b) => a.position - b.position)

    for (const raw of sorted) {
      const channel = this.transform(raw)
      entities[raw.id] = {
        data: channel,
        partial: false,
        cachedAt: Date.now(),
      }
      orderedIds.push(raw.id)
    }

    this.store.setState((state) => ({
      ...state,
      entities,
      byCommunity: { ...state.byCommunity, [communityId]: orderedIds },
      groups: { ...state.groups, [communityId]: groupState.groups },
      ungrouped: {
        ...state.ungrouped,
        [communityId]: groupState.ungroupedChannelIds,
      },
      collapsed: {
        ...state.collapsed,
        [communityId]: state.collapsed[communityId] ?? groupState.collapsedGroupIds,
      },
      loadingByCommunity: {
        ...state.loadingByCommunity,
        [communityId]: false,
      },
      revision: state.revision + 1,
    }))
    this.persist()
  }

  updateChannel(id: string, changes: Partial<HavenChannel>): void {
    const existing = this.store.getState().entities[id]
    if (!existing) return

    this.store.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [id]: {
          ...existing,
          data: { ...existing.data, ...changes },
          cachedAt: Date.now(),
        },
      },
      revision: state.revision + 1,
    }))
    this.persist()
  }

  removeChannel(id: string, communityId: string): void {
    this.store.setState((state) => {
      const { [id]: _, ...restEntities } = state.entities
      const nextGroups = (state.groups[communityId] ?? []).map((group) => ({
        ...group,
        channelIds: group.channelIds.filter((channelId) => channelId !== id),
      }))

      return {
        ...state,
        entities: restEntities,
        byCommunity: {
          ...state.byCommunity,
          [communityId]: (state.byCommunity[communityId] ?? []).filter(
            (channelId) => channelId !== id,
          ),
        },
        groups: {
          ...state.groups,
          [communityId]: nextGroups,
        },
        ungrouped: {
          ...state.ungrouped,
          [communityId]: (state.ungrouped[communityId] ?? []).filter(
            (channelId) => channelId !== id,
          ),
        },
        activeChannelId: state.activeChannelId === id ? null : state.activeChannelId,
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  setActiveChannelId(id: string | null): void {
    this.store.setState((state) => ({
      ...state,
      activeChannelId: id,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  setGroupCollapsed(
    communityId: string,
    groupId: string,
    collapsed: boolean,
  ): void {
    this.store.setState((state) => {
      const current = state.collapsed[communityId] ?? []
      const has = current.includes(groupId)

      if (collapsed === has) {
        return state
      }

      const nextCollapsed = collapsed
        ? [...current, groupId]
        : current.filter((id) => id !== groupId)

      return {
        ...state,
        collapsed: {
          ...state.collapsed,
          [communityId]: nextCollapsed,
        },
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  setIsLoading(communityId: string, loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      loadingByCommunity: {
        ...state.loadingByCommunity,
        [communityId]: loading,
      },
      revision: state.revision + 1,
    }))
  }

  getChannelsSnapshot(communityId: string): HavenChannel[] {
    const state = this.store.getState()
    const ids = state.byCommunity[communityId] ?? []
    if (ids.length === 0) return EMPTY_CHANNELS

    const channels: HavenChannel[] = []
    for (const id of ids) {
      const entry = state.entities[id]
      if (entry && !entry.partial) {
        channels.push(entry.data)
      }
    }
    return channels
  }

  getDefaultChannelId(communityId: string): string | null {
    const channels = this.getChannelsSnapshot(communityId)
    const textChannel = channels.find((channel) => channel.kind === 'text')
    return textChannel?.id ?? null
  }

  override persist(): void {
    try {
      const state = this.store.getState()
      const persistable = {
        entities: Object.fromEntries(
          Object.entries(state.entities).filter(([_, entry]) => !entry.partial),
        ),
        byCommunity: state.byCommunity,
        groups: state.groups,
        ungrouped: state.ungrouped,
        collapsed: state.collapsed,
        activeChannelId: state.activeChannelId,
      }
      getSharedNexusStorage().set(STORAGE_KEY, JSON.stringify(persistable))
    } catch (error) {
      console.warn('[ChannelNexus] Failed to persist', error)
    }
  }

  override rehydrate(): void {
    try {
      const raw = getSharedNexusStorage().getString(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        entities: Record<string, NexusEntry<HavenChannel>>
        byCommunity: Record<string, string[]>
        groups: Record<string, ChannelGroup[]>
        ungrouped: Record<string, string[]>
        collapsed: Record<string, string[]>
        activeChannelId: string | null
      }

      this.store.setState((state) => ({
        ...state,
        entities: parsed.entities ?? {},
        byCommunity: parsed.byCommunity ?? {},
        groups: parsed.groups ?? {},
        ungrouped: parsed.ungrouped ?? {},
        collapsed: parsed.collapsed ?? {},
        activeChannelId: parsed.activeChannelId ?? null,
        loadingByCommunity: {},
        revision: 0,
      }))
    } catch (error) {
      console.warn('[ChannelNexus] Failed to rehydrate', error)
      getSharedNexusStorage().remove(STORAGE_KEY)
    }
  }

  override clear(): void {
    this.store.setState({
      entities: {},
      byCommunity: {},
      groups: {},
      ungrouped: {},
      collapsed: {},
      activeChannelId: null,
      loadingByCommunity: {},
      revision: 0,
    })
    this.channelSelectors.clear()
    this.channelsSelectors.clear()
    this.groupsSelectors.clear()
    this.loadingSelectors.clear()
    this.channelsSnapshots.clear()
    this.groupStateSnapshots.clear()
    getSharedNexusStorage().remove(STORAGE_KEY)
  }

  useChannels(communityId: string): HavenChannel[] {
    return useStoreWithEqualityFn(
      this.store,
      this.getChannelsSelector(communityId),
      channelsEqual,
    )
  }

  useChannel(id: string): HavenChannel | undefined {
    return useStoreWithEqualityFn(this.store, this.getChannelSelector(id))
  }

  useChannelGroups(communityId: string): ChannelGroupState {
    return useStoreWithEqualityFn(
      this.store,
      this.getGroupsSelector(communityId),
      groupStateEqual,
    )
  }

  useActiveChannelId(): string | null {
    return useStoreWithEqualityFn(this.store, selectActiveChannelId)
  }

  useIsLoading(communityId: string): boolean {
    return useStoreWithEqualityFn(this.store, this.getLoadingSelector(communityId))
  }
}

export const channelNexus = new ChannelNexus()
