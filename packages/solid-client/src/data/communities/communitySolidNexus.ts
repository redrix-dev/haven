import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
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

  constructor(private readonly controlPlane: ControlPlaneBackend) {
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
  rehydrate(): void {}

  loadDisplayOrder(userId: string | null): void {
    this.setState(
      "displayOrderIds",
      userId ? readCommunityDisplayOrder(userId) : null,
    );
  }

  clear(): void {
    this.setState(initialState());
  }

  setActiveId(id: string | null): void {
    if (this.state.activeId === id) return;
    this.setState("activeId", id);
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
    this.setState("orderedIds", orderedIds);
  }
}

export function createCommunitySolidNexus(
  controlPlane: ControlPlaneBackend,
): CommunitySolidNexus {
  return new CommunitySolidNexus(controlPlane);
}
