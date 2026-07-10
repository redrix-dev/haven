import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  projectChannels,
  selectActiveChannelId,
} from "@shared/nexus/community/channelSelectors";
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { Channel, ChannelGroupState } from "@shared/lib/backend/types";

/**
 * ChannelSolidNexus — one cohesive owner for the channel domain.
 *
 * Owns its whole story in a single file: state + lifecycle + realtime + the
 * reactive projections the UI reads. It holds a Solid store directly and lets
 * Solid's fine-grained reactivity do the work — no readable-store adapter, no
 * tick counter, no `revision` bookkeeping, no per-read equality functions. A
 * mutation is just `setState(...)`; the components that read the touched fields
 * re-run, and nothing else does.
 *
 * Pure domain knowledge (which slice, how it's shaped) still lives in the
 * shared selectors so mobile and web/desktop agree on one projection per
 * concept. This class only adds the Solid-native wiring around them.
 */

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

export class ChannelSolidNexus {
  /** The live store proxy. Read-only to the outside; writes go through methods. */
  readonly state: ChannelNexusState;
  private readonly setState: SetStoreFunction<ChannelNexusState>;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly persistence: NexusPersistence,
    private readonly communityData: CommunityDataBackend,
  ) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  // ─── reactive projections (call from component scope) ──────────────────────
  //
  // These return Solid accessors built straight over the store. Solid tracks
  // exactly which fields `projectChannels` touches, so a channel upsert in one
  // community never wakes a list rendering another.

  /** The channels of `communityId`, reactive to both store and the id getter. */
  channels(communityId: Accessor<string>): Accessor<HavenChannel[]> {
    return createMemo(() => projectChannels(this.state, communityId()));
  }

  /** The active channel id — a tracked read; call inside a reactive scope. */
  activeChannelId(): string | null {
    return selectActiveChannelId(this.state);
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

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

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.channels);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        entities: Record<string, NexusEntry<HavenChannel>>;
        byCommunity: Record<string, string[]>;
        groups: ChannelNexusState["groups"];
        ungrouped: ChannelNexusState["ungrouped"];
        collapsed: ChannelNexusState["collapsed"];
        activeChannelId: string | null;
        lastChannelByCommunity?: Record<string, string | null>;
      };
      this.setState({
        entities: parsed.entities ?? {},
        byCommunity: parsed.byCommunity ?? {},
        groups: parsed.groups ?? {},
        ungrouped: parsed.ungrouped ?? {},
        collapsed: parsed.collapsed ?? {},
        activeChannelId: parsed.activeChannelId ?? null,
        lastChannelByCommunity: parsed.lastChannelByCommunity ?? {},
        loadingByCommunity: {},
      });
    } catch (error) {
      console.warn("[ChannelSolidNexus] Failed to rehydrate", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.channels);
    }
  }

  clear(): void {
    this.setState(initialState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.channels);
  }

  private persist(): void {
    try {
      const state = this.state;
      const persistable = {
        entities: Object.fromEntries(
          Object.entries(state.entities).filter(([, entry]) => !entry.partial),
        ),
        byCommunity: state.byCommunity,
        groups: state.groups,
        ungrouped: state.ungrouped,
        collapsed: state.collapsed,
        activeChannelId: state.activeChannelId,
        lastChannelByCommunity: state.lastChannelByCommunity,
      };
      this.persistence.set(
        NEXUS_STORAGE_KEYS.channels,
        JSON.stringify(persistable),
      );
    } catch (error) {
      console.warn("[ChannelSolidNexus] Failed to persist", error);
    }
  }

  // ─── realtime + writes ───────────────────────────────────────────────────

  /** Insert / update a single channel from a realtime event. */
  upsertChannel(raw: Channel | unknown): void {
    const channel = toHavenChannel(raw as Channel);
    this.setState("entities", channel.id, {
      data: channel,
      partial: false,
      cachedAt: Date.now(),
    });
    const communityIds = this.state.byCommunity[channel.communityId] ?? [];
    if (!communityIds.includes(channel.id)) {
      this.setState("byCommunity", channel.communityId, [
        ...communityIds,
        channel.id,
      ]);
    }
    this.persist();
  }

  removeChannel(id: string, communityId: string): void {
    this.setState("entities", id, undefined!);
    this.setState("byCommunity", communityId, (ids = []) =>
      ids.filter((channelId) => channelId !== id),
    );
    this.setState("ungrouped", communityId, (ids = []) =>
      ids.filter((channelId) => channelId !== id),
    );
    this.setState("groups", communityId, (groups = []) =>
      groups.map((group) => ({
        ...group,
        channelIds: group.channelIds.filter((channelId) => channelId !== id),
      })),
    );
    this.persist();
  }

  setChannels(
    communityId: string,
    channels: Channel[],
    groupState: ChannelGroupState,
  ): void {
    const sorted = [...channels].sort((a, b) => a.position - b.position);
    const orderedIds: string[] = [];
    for (const raw of sorted) {
      const channel = toHavenChannel(raw);
      this.setState("entities", raw.id, {
        data: channel,
        partial: false,
        cachedAt: Date.now(),
      });
      orderedIds.push(raw.id);
    }
    this.setState("byCommunity", communityId, orderedIds);
    this.setState("groups", communityId, groupState.groups);
    this.setState("ungrouped", communityId, groupState.ungroupedChannelIds);
    this.setState(
      "collapsed",
      communityId,
      (existing) => existing ?? groupState.collapsedGroupIds,
    );
    this.setState("loadingByCommunity", communityId, false);
    this.persist();
  }

  setActiveChannelId(id: string | null): void {
    if (this.state.activeChannelId === id) return;
    this.setState("activeChannelId", id);
    this.persist();
  }

  private setIsLoading(communityId: string, loading: boolean): void {
    this.setState("loadingByCommunity", communityId, loading);
  }
}

export function createChannelSolidNexus(
  persistence: NexusPersistence,
  communityData: CommunityDataBackend,
): ChannelSolidNexus {
  return new ChannelSolidNexus(persistence, communityData);
}
