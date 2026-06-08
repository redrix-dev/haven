import { createStore, type StoreApi } from 'zustand/vanilla'
import { Nexus, type NexusEntry } from '@shared/nexus/Nexus'
import type { ReadableStore } from '@shared/nexus/storeTypes'
import type {
  ChannelNexusState,
  HavenChannel,
} from '@shared/nexus/community/channelTypes'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { CommunityDataBackend } from '@shared/lib/backend/communityDataBackend.interface'
import type {
  Channel,
  ChannelGroup,
  ChannelGroupState,
} from '@shared/lib/backend/types'

export type { HavenChannel, ChannelNexusState }

const STORAGE_KEY = 'haven:nexus:channels:global'
const EMPTY_CHANNELS: HavenChannel[] = []

export class ChannelNexus extends Nexus<HavenChannel, Channel> {
  private _channelStore: StoreApi<ChannelNexusState> | null = null

  private readonly communityData: CommunityDataBackend
  private inflight = new Map<string, Promise<void>>()

  constructor(persistence: NexusPersistence, communityData: CommunityDataBackend) {
    super('channels', 'global', persistence)
    this.communityData = communityData
  }

  /**
   * Fetch channels and channel-groups for a community and replace the nexus
   * entries for that community. Deduplicated: concurrent calls share the same promise.
   */
  async loadForCommunity(communityId: string): Promise<void> {
    if (!this.communityData) {
      throw new Error(
        'ChannelNexus.loadForCommunity called before communityData was attached.',
      )
    }

    const existing = this.inflight.get(communityId)
    if (existing) return existing

    const promise = (async () => {
      this.setIsLoading(communityId, true)
      try {
        const channels = await this.communityData!.listChannels(communityId)
        let groupState: ChannelGroupState
        try {
          groupState = await this.communityData!.listChannelGroups({
            communityId,
            channelIds: channels.map((channel) => channel.id),
          })
        } catch {
          groupState = {
            groups: [],
            ungroupedChannelIds: channels.map((channel) => channel.id),
            collapsedGroupIds: [],
          }
        }
        this.setChannels(communityId, channels, groupState)
      } finally {
        this.setIsLoading(communityId, false)
        this.inflight.delete(communityId)
      }
    })()

    this.inflight.set(communityId, promise)
    return promise
  }

  /**
   * Load channels for a community if we don't already have them cached.
   * The nexus reads `byCommunity` to decide; rehydrated state counts as cached.
   */
  async ensureLoaded(communityId: string): Promise<void> {
    const ids = this.store.getState().byCommunity[communityId] ?? []
    if (ids.length > 0) return
    await this.loadForCommunity(communityId)
  }

  /**
   * Insert / update a single channel from a realtime event.
   */
  upsertChannel(raw: Channel): void {
    const channel = this.transform(raw)
    this.store.setState((state) => {
      const communityIds = state.byCommunity[channel.communityId] ?? []
      const alreadyIndexed = communityIds.includes(channel.id)
      const nextEntities = {
        ...state.entities,
        [channel.id]: {
          data: channel,
          partial: false,
          cachedAt: Date.now(),
        },
      }
      const nextByCommunity = alreadyIndexed
        ? state.byCommunity
        : {
            ...state.byCommunity,
            [channel.communityId]: [...communityIds, channel.id],
          }
      return {
        ...state,
        entities: nextEntities,
        byCommunity: nextByCommunity,
        revision: state.revision + 1,
      }
    })
    this.persist()
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

  /**
   * Full vanilla store — `protected` so only the class (and Nexus base) can
   * mutate via `setState`. External readers go through `reactiveStore`.
   */
  protected override get store(): StoreApi<ChannelNexusState> {
    if (!this._channelStore) {
      this._channelStore = createStore<ChannelNexusState>(() => ({
        entities: {},
        byCommunity: {},
        groups: {},
        ungrouped: {},
        collapsed: {},
        activeChannelId: null,
        loadingByCommunity: {},
        lastChannelByCommunity: {},
        revision: 0,
      }))
      this.rehydrate()
    }
    return this._channelStore
  }

  /**
   * Read-only store handle for the binding packages (`@mobile-data/hooks`,
   * `@solid-bindings`). Exposes `getState`/`subscribe` only — not `setState` —
   * so reactivity bindings can observe channel state without bypassing the
   * class's action methods, persistence, or revision bookkeeping.
   */
  get reactiveStore(): ReadableStore<ChannelNexusState> {
    return this.store
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
    if (this.store.getState().activeChannelId === id) return
    this.store.setState((state) => {
      const next: Partial<ChannelNexusState> = {
        activeChannelId: id,
        revision: state.revision + 1,
      }

      if (id) {
        const entry = state.entities[id]
        const communityId = entry?.data.communityId
        if (communityId) {
          next.lastChannelByCommunity = {
            ...state.lastChannelByCommunity,
            [communityId]: id,
          }
        }
      }

      return { ...state, ...next }
    })
    this.persist()
  }

  getActiveChannelId(): string | null {
    return this.store.getState().activeChannelId
  }

  getChannel(id: string): HavenChannel | undefined {
    return this.store.getState().entities[id]?.data
  }

  /**
   * Last visited channel for a community.
   * Used by route focus sync to restore the user's place.
   */
  getLastChannelId(communityId: string): string | null {
    return this.store.getState().lastChannelByCommunity[communityId] ?? null
  }

  private getGroupStateSnapshot(communityId: string): ChannelGroupState {
    const state = this.store.getState()
    return {
      groups: state.groups[communityId] ?? [],
      ungroupedChannelIds: state.ungrouped[communityId] ?? [],
      collapsedGroupIds: state.collapsed[communityId] ?? [],
    }
  }

  private requireCommunityData(): CommunityDataBackend {
    if (!this.communityData) {
      throw new Error(
        'ChannelNexus mutation called before communityData was attached.',
      )
    }
    return this.communityData
  }

  async createChannelGroup(
    communityId: string,
    name: string,
    createdByUserId: string,
    channelIdToAssign?: string | null,
  ): Promise<void> {
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('Group name is required.')

    const communityData = this.requireCommunityData()
    const groupState = this.getGroupStateSnapshot(communityId)
    const nextPosition =
      groupState.groups.length === 0
        ? 0
        : Math.max(...groupState.groups.map((group) => group.position)) + 1

    const createdGroup = await communityData.createChannelGroup({
      communityId,
      name: normalizedName,
      position: nextPosition,
      createdByUserId,
    })

    if (channelIdToAssign) {
      await communityData.setChannelGroupForChannel({
        communityId,
        channelId: channelIdToAssign,
        groupId: createdGroup.id,
        position: 0,
      })
    }

    await this.loadForCommunity(communityId)
  }

  async renameChannelGroup(
    communityId: string,
    groupId: string,
    name: string,
  ): Promise<void> {
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('Group name is required.')

    await this.requireCommunityData().renameChannelGroup({
      communityId,
      groupId,
      name: normalizedName,
    })

    this.store.setState((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [communityId]: (state.groups[communityId] ?? []).map((group) =>
          group.id === groupId ? { ...group, name: normalizedName } : group,
        ),
      },
      revision: state.revision + 1,
    }))
    this.persist()
  }

  async deleteChannelGroup(communityId: string, groupId: string): Promise<void> {
    await this.requireCommunityData().deleteChannelGroup({
      communityId,
      groupId,
    })
    await this.loadForCommunity(communityId)
  }

  async assignChannelToGroup(
    communityId: string,
    channelId: string,
    groupId: string,
  ): Promise<void> {
    const targetGroup = this.getGroupStateSnapshot(communityId).groups.find(
      (group) => group.id === groupId,
    )
    if (!targetGroup) throw new Error('Channel group not found.')

    await this.requireCommunityData().setChannelGroupForChannel({
      communityId,
      channelId,
      groupId,
      position: targetGroup.channelIds.length,
    })
    await this.loadForCommunity(communityId)
  }

  async removeChannelFromGroup(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    await this.requireCommunityData().setChannelGroupForChannel({
      communityId,
      channelId,
      groupId: null,
      position: 0,
    })
    await this.loadForCommunity(communityId)
  }

  async setChannelGroupCollapsed(
    communityId: string,
    groupId: string,
    isCollapsed: boolean,
  ): Promise<void> {
    await this.requireCommunityData().setChannelGroupCollapsed({
      communityId,
      groupId,
      isCollapsed,
    })
    this.setGroupCollapsed(communityId, groupId, isCollapsed)
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
        lastChannelByCommunity: state.lastChannelByCommunity,
      }
      this.persistence.set(STORAGE_KEY, JSON.stringify(persistable))
    } catch (error) {
      console.warn('[ChannelNexus] Failed to persist', error)
    }
  }

  override rehydrate(): void {
    try {
      const raw = this.persistence.getString(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        entities: Record<string, NexusEntry<HavenChannel>>
        byCommunity: Record<string, string[]>
        groups: Record<string, ChannelGroup[]>
        ungrouped: Record<string, string[]>
        collapsed: Record<string, string[]>
        activeChannelId: string | null
        lastChannelByCommunity?: Record<string, string | null>
      }

      this.store.setState((state) => ({
        ...state,
        entities: parsed.entities ?? {},
        byCommunity: parsed.byCommunity ?? {},
        groups: parsed.groups ?? {},
        ungrouped: parsed.ungrouped ?? {},
        collapsed: parsed.collapsed ?? {},
        activeChannelId: parsed.activeChannelId ?? null,
        lastChannelByCommunity: parsed.lastChannelByCommunity ?? {},
        loadingByCommunity: {},
        revision: 0,
      }))
    } catch (error) {
      console.warn('[ChannelNexus] Failed to rehydrate', error)
      this.persistence.remove(STORAGE_KEY)
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
      lastChannelByCommunity: {},
      revision: 0,
    })
    this.persistence.remove(STORAGE_KEY)
  }
}

