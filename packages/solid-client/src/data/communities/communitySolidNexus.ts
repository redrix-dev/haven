import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  projectCommunities,
  selectActiveId,
  selectDisplayOrderIds,
} from "@shared/nexus/community/communitySelectors";
import type {
  Community,
  CommunityNexusState,
} from "@shared/nexus/community/communityTypes";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { ServerSummary } from "@shared/lib/backend/types";
import {
  applyCommunityDisplayOrder,
  readCommunityDisplayOrder,
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

const toCommunity = (raw: ServerSummary): Community => ({
  id: raw.id,
  name: raw.name,
  createdAt: raw.created_at,
});

export class CommunitySolidNexus {
  readonly state: CommunityNexusState;
  private readonly setState: SetStoreFunction<CommunityNexusState>;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly persistence: NexusPersistence,
    private readonly controlPlane: ControlPlaneBackend,
  ) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  communities(): Accessor<Community[]> {
    return createMemo(() => projectCommunities(this.state));
  }
  orderedCommunities(): Accessor<Community[]> {
    return createMemo(() =>
      applyCommunityDisplayOrder(
        projectCommunities(this.state),
        selectDisplayOrderIds(this.state),
      ),
    );
  }
  activeCommunityId(): string | null {
    return selectActiveId(this.state);
  }

  getActiveId(): string | null {
    return this.state.activeId;
  }

  getCommunityIds(): string[] {
    return this.state.orderedIds;
  }

  async load(userId: string): Promise<void> {
    if (this.loadPromise) return this.loadPromise; // already loading? reuse it
    this.loadPromise = (async () => {
      this.setState("isLoading", true);
      try {
        const communities = await this.controlPlane.listUserCommunities(userId);
        this.setCommunities(communities);
      } catch (err) {
        this.setState(
          "loadError",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        this.setState("isLoading", false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async ensureLoaded(userId: string): Promise<void> {
    if (this.state.orderedIds.length > 0) return;
    await this.load(userId);
  }
  // display-order persistence (setDisplayOrder/reset) intentionally not ported —
  // no caller in the Solid app yet; add when a reorder UI lands.
  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.communities);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        entities: Record<string, NexusEntry<Community>>;
        orderedIds: string[];
        activeId: string | null;
      };
      this.setState({
        entities: parsed.entities ?? {},
        orderedIds: parsed.orderedIds ?? [],
        activeId: parsed.activeId ?? null,
      });
    } catch (error) {
      console.warn("[CommunitySolidNexus] Failed to rehydrate", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.communities);
    }
  }

  private persist(): void {
    try {
      const state = this.state;
      const persistable = {
        entities: Object.fromEntries(
          Object.entries(state.entities).filter(([, entry]) => !entry.partial),
        ),
        orderedIds: state.orderedIds,
        activeId: state.activeId,
      };
      this.persistence.set(
        NEXUS_STORAGE_KEYS.communities,
        JSON.stringify(persistable),
      );
    } catch (error) {
      console.warn("[CommunitySolidNexus] Failed to persist", error);
    }
  }

  loadDisplayOrder(userId: string | null): void {
    this.setState(
      "displayOrderIds",
      userId ? readCommunityDisplayOrder(userId) : null,
    );
  }

  clear(): void {
    this.setState(initialState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.communities);
  }

  setActiveId(id: string | null): void {
    if (this.state.activeId === id) return;
    this.setState("activeId", id);
    this.persist();
  }

  removeCommunity(id: string): void {
    this.setState("entities", id, undefined!);
    this.setState("orderedIds", (ids) =>
      ids.filter((communityId) => communityId !== id),
    );
    if (this.state.activeId === id) this.setState("activeId", null);
    this.persist();
  }

  setCommunities(communities: ServerSummary[]): void {
    const orderedIds: string[] = [];
    for (const raw of communities) {
      const community = toCommunity(raw);
      this.setState("entities", raw.id, {
        data: community,
        partial: false,
        cachedAt: Date.now(),
      });
      orderedIds.push(raw.id);
    }
    const retainedIds = new Set(orderedIds);
    for (const existingId of Object.keys(this.state.entities)) {
      if (!retainedIds.has(existingId)) {
        this.setState("entities", existingId, undefined!);
      }
    }
    this.setState("orderedIds", orderedIds);
    this.persist();
  }
}

export function createCommunitySolidNexus(
  persistence: NexusPersistence,
  controlPlane: ControlPlaneBackend,
): CommunitySolidNexus {
  return new CommunitySolidNexus(persistence, controlPlane);
}
