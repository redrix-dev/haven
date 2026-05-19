import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Nexus, type NexusEntry, type NexusState } from '../Nexus'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import type { ControlPlaneBackend } from '@shared/lib/backend/controlPlaneBackend.interface'
import type { ServerSummary } from '@shared/lib/backend/types'
import type { StoreApi, UseBoundStore } from 'zustand'

export type Community = {
  id: string
  name: string
  createdAt: string
}

export type CommunityNexusState = NexusState<Community> & {
  orderedIds: string[]
  activeId: string | null
  isLoading: boolean
}

const STORAGE_KEY = 'haven:nexus:communities:global'
const EMPTY_COMMUNITIES: Community[] = []

const selectActiveId = (state: CommunityNexusState) => state.activeId
const selectIsLoading = (state: CommunityNexusState) => state.isLoading

const selectCommunities = (state: CommunityNexusState): Community[] => {
  if (state.orderedIds.length === 0) return EMPTY_COMMUNITIES

  return state.orderedIds
    .map((id) => state.entities[id]?.data)
    .filter((community): community is Community => community !== undefined)
}

export const communitiesEqual = (a: Community[], b: Community[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false
  }
  return true
}

export class CommunityNexus extends Nexus<Community, ServerSummary> {
  private _communityStore: UseBoundStore<StoreApi<CommunityNexusState>> | null =
    null

  private communitySelectors = new Map<
    string,
    (state: CommunityNexusState) => Community | undefined
  >()

  private communitiesSnapshot: Community[] = EMPTY_COMMUNITIES

  private readonly communitiesSelector = (
    state: CommunityNexusState,
  ): Community[] => {
    void state.revision
    const next = selectCommunities(state)
    if (communitiesEqual(this.communitiesSnapshot, next)) {
      return this.communitiesSnapshot
    }
    this.communitiesSnapshot = next
    return next
  }

  private controlPlane: ControlPlaneBackend | null = null

  constructor(persistence: NexusPersistence) {
    super('communities', 'global', persistence)
  }

  /**
   * Wire the backend used by `load`. Called by HavenCore once during construction.
   */
  setControlPlane(controlPlane: ControlPlaneBackend): void {
    this.controlPlane = controlPlane
  }

  /**
   * Replace the community list from the control plane. Called during
   * bootstrapSession and when a community is created/joined/left.
   */
  async load(userId: string): Promise<void> {
    if (!this.controlPlane) {
      throw new Error(
        'CommunityNexus.load called before controlPlane was attached. HavenCore must wire backends during construction.',
      )
    }
    this.setIsLoading(true)
    try {
      const list = await this.controlPlane.listUserCommunities(userId)
      this.setCommunities(
        list.map((community) => ({
          id: community.id,
          name: community.name,
          createdAt: community.created_at,
        })),
      )
    } finally {
      this.setIsLoading(false)
    }
  }

  protected transform(raw: ServerSummary): Community {
    return {
      id: raw.id,
      name: raw.name,
      createdAt: raw.created_at,
    }
  }

  protected override get store(): UseBoundStore<StoreApi<CommunityNexusState>> {
    if (!this._communityStore) {
      this._communityStore = create<CommunityNexusState>(() => ({
        entities: {},
        orderedIds: [],
        activeId: null,
        isLoading: false,
        revision: 0,
      }))
      this.rehydrate()
    }
    return this._communityStore
  }

  private getCommunitySelector(
    id: string,
  ): (state: CommunityNexusState) => Community | undefined {
    if (!this.communitySelectors.has(id)) {
      this.communitySelectors.set(id, (state) => state.entities[id]?.data)
    }
    return this.communitySelectors.get(id)!
  }

  setCommunities(communities: Community[]): void {
    const entities: Record<string, NexusEntry<Community>> = {}
    const orderedIds: string[] = []

    for (const community of communities) {
      entities[community.id] = {
        data: community,
        partial: false,
        cachedAt: Date.now(),
      }
      orderedIds.push(community.id)
    }

    this.store.setState((state) => ({
      ...state,
      entities,
      orderedIds,
      isLoading: false,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  updateCommunity(id: string, changes: Partial<Community>): void {
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

  removeCommunity(id: string): void {
    this.store.setState((state) => {
      const { [id]: _, ...restEntities } = state.entities
      return {
        ...state,
        entities: restEntities,
        orderedIds: state.orderedIds.filter((communityId) => communityId !== id),
        activeId: state.activeId === id ? null : state.activeId,
        revision: state.revision + 1,
      }
    })
    this.persist()
  }

  setActiveId(id: string | null): void {
    this.store.setState((state) => ({
      ...state,
      activeId: id,
      revision: state.revision + 1,
    }))
    this.persist()
  }

  getActiveId(): string | null {
    return this.store.getState().activeId
  }

  setIsLoading(loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      isLoading: loading,
      revision: state.revision + 1,
    }))
  }

  override persist(): void {
    try {
      const state = this.store.getState()
      const persistable = {
        entities: Object.fromEntries(
          Object.entries(state.entities).filter(([_, entry]) => !entry.partial),
        ),
        orderedIds: state.orderedIds,
        activeId: state.activeId,
      }
      this.persistence.set(STORAGE_KEY, JSON.stringify(persistable))
    } catch (error) {
      console.warn('[CommunityNexus] Failed to persist', error)
    }
  }

  override rehydrate(): void {
    try {
      const raw = this.persistence.getString(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        entities: Record<string, NexusEntry<Community>>
        orderedIds: string[]
        activeId: string | null
      }

      this.store.setState((state) => ({
        ...state,
        entities: parsed.entities ?? {},
        orderedIds: parsed.orderedIds ?? [],
        activeId: parsed.activeId ?? null,
        revision: 0,
      }))
    } catch (error) {
      console.warn('[CommunityNexus] Failed to rehydrate', error)
      this.persistence.remove(STORAGE_KEY)
    }
  }

  override clear(): void {
    this.store.setState({
      entities: {},
      orderedIds: [],
      activeId: null,
      isLoading: false,
      revision: 0,
    })
    this.communitiesSnapshot = EMPTY_COMMUNITIES
    this.communitySelectors.clear()
    this.persistence.remove(STORAGE_KEY)
  }

  useCommunities(): Community[] {
    return useStoreWithEqualityFn(
      this.store,
      this.communitiesSelector,
      communitiesEqual,
    )
  }

  useCommunity(id: string): Community | undefined {
    return useStoreWithEqualityFn(this.store, this.getCommunitySelector(id))
  }

  useActiveId(): string | null {
    return useStoreWithEqualityFn(this.store, selectActiveId)
  }

  useIsLoading(): boolean {
    return useStoreWithEqualityFn(this.store, selectIsLoading)
  }
}

