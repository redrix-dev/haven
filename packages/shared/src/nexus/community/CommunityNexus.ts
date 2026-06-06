import { useMemo } from 'react'
import { create } from 'zustand'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Nexus, type NexusEntry, type NexusState } from '../Nexus'
import type { NexusPersistence } from '@shared/core/persistence/NexusPersistence'
import {
  applyCommunityDisplayOrder,
  clearCommunityDisplayOrder,
  hasSameIdSequence,
  readCommunityDisplayOrder,
  writeCommunityDisplayOrder,
} from '@shared/core/communityDisplayOrder'
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
  loadError: string | null
  displayOrderIds: string[] | null
}

const STORAGE_KEY = 'haven:nexus:communities:global'
const EMPTY_COMMUNITIES: Community[] = []

const selectActiveId = (state: CommunityNexusState) => state.activeId
const selectIsLoading = (state: CommunityNexusState) => state.isLoading
const selectLoadError = (state: CommunityNexusState) => state.loadError
const selectDisplayOrderIds = (state: CommunityNexusState) => state.displayOrderIds

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

  private readonly controlPlane: ControlPlaneBackend
  private onListChanged: (() => void) | null = null

  constructor(persistence: NexusPersistence, controlPlane: ControlPlaneBackend) {
    super('communities', 'global', persistence)
    this.controlPlane = controlPlane
  }

  setOnListChanged(listener: (() => void) | null): void {
    this.onListChanged = listener
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
    this.setLoadError(null)
    try {
      const list = await this.controlPlane.listUserCommunities(userId)
      this.setCommunities(
        list.map((community) => ({
          id: community.id,
          name: community.name,
          createdAt: community.created_at,
        })),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load communities.'
      this.setLoadError(message)
      throw error
    } finally {
      this.setIsLoading(false)
    }
  }

  loadDisplayOrder(userId: string | null): void {
    if (!userId) {
      this.setDisplayOrderIds(null)
      return
    }
    this.setDisplayOrderIds(readCommunityDisplayOrder(userId))
  }

  setDisplayOrder(ids: string[], userId: string | null): void {
    const communities = selectCommunities(this.store.getState())
    const currentOrderedIds = applyCommunityDisplayOrder(
      communities,
      this.store.getState().displayOrderIds,
    ).map((community) => community.id)
    if (hasSameIdSequence(currentOrderedIds, ids)) return

    this.setDisplayOrderIds(ids)
    if (userId) writeCommunityDisplayOrder(userId, ids)
  }

  resetDisplayOrder(userId: string | null): void {
    this.setDisplayOrderIds(null)
    if (userId) clearCommunityDisplayOrder(userId)
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
        loadError: null,
        displayOrderIds: null,
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
    this.onListChanged?.()
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
    this.onListChanged?.()
  }

  setActiveId(id: string | null): void {
    if (this.store.getState().activeId === id) return
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

  getIsLoading(): boolean {
    return this.store.getState().isLoading
  }

  getCommunityIds(): string[] {
    return this.store.getState().orderedIds
  }

  getCommunity(id: string): Community | undefined {
    return this.store.getState().entities[id]?.data
  }

  setIsLoading(loading: boolean): void {
    this.store.setState((state) => ({
      ...state,
      isLoading: loading,
      revision: state.revision + 1,
    }))
  }

  setLoadError(error: string | null): void {
    this.store.setState((state) => ({
      ...state,
      loadError: error,
      revision: state.revision + 1,
    }))
  }

  clearLoadError(): void {
    this.setLoadError(null)
  }

  private setDisplayOrderIds(ids: string[] | null): void {
    this.store.setState((state) => ({
      ...state,
      displayOrderIds: ids,
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
      loadError: null,
      displayOrderIds: null,
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

  useLoadError(): string | null {
    return useStoreWithEqualityFn(this.store, selectLoadError)
  }

  useDisplayOrderIds(): string[] | null {
    return useStoreWithEqualityFn(this.store, selectDisplayOrderIds)
  }

  useOrderedCommunities(): Community[] {
    const communities = this.useCommunities()
    const displayOrderIds = this.useDisplayOrderIds()
    return useMemo(
      () => applyCommunityDisplayOrder(communities, displayOrderIds),
      [communities, displayOrderIds],
    )
  }
}

