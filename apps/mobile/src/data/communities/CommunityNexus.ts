import { createStore, type StoreApi } from 'zustand/vanilla'
import { Nexus, type NexusEntry } from '@mobile-data/Nexus'
import type { ReadableStore } from '@shared/nexus/storeTypes'
import { projectCommunities } from '@shared/nexus/community/communitySelectors'
import type {
  Community,
  CommunityNexusState,
} from '@shared/nexus/community/communityTypes'
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

export type { Community, CommunityNexusState }

const STORAGE_KEY = 'haven:nexus:communities:global'

export class CommunityNexus extends Nexus<Community, ServerSummary> {
  private _communityStore: StoreApi<CommunityNexusState> | null = null

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
    const communities = projectCommunities(this.store.getState())
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

  protected override get store(): StoreApi<CommunityNexusState> {
    if (!this._communityStore) {
      this._communityStore = createStore<CommunityNexusState>(() => ({
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

  /**
   * Read-only store handle for the binding packages — `getState`/`subscribe`
   * only, no `setState`, so reactivity bindings can't bypass action methods.
   */
  get reactiveStore(): ReadableStore<CommunityNexusState> {
    return this.store
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
    this.persistence.remove(STORAGE_KEY)
  }
}

