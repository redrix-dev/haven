import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  projectChannelGroups,
  projectChannels,
  selectActiveChannelId,
} from "@shared/nexus/community/channelSelectors";
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  Channel,
  ChannelAccessRevokedResult,
  ChannelGroupState,
  ChannelKind,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
} from "@shared/lib/backend/types";

export type ChannelSolidState = ChannelNexusState & {
  permissionsByChannel: Record<string, ChannelPermissionsSnapshot | undefined>;
  permissionsLoadingByChannel: Record<string, boolean>;
  permissionsErrorsByChannel: Record<string, string | null>;
};

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

const initialState = (): ChannelSolidState => ({
  entities: {},
  byCommunity: {},
  groups: {},
  ungrouped: {},
  collapsed: {},
  activeChannelId: null,
  loadingByCommunity: {},
  lastChannelByCommunity: {},
  permissionsByChannel: {},
  permissionsLoadingByChannel: {},
  permissionsErrorsByChannel: {},
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
  readonly state: ChannelSolidState;
  private readonly setState: SetStoreFunction<ChannelSolidState>;
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly permissionsInflight = new Map<
    string,
    Promise<ChannelPermissionsSnapshot>
  >();

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

  /** Whether the community's channel list is currently being refreshed. */
  loading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.loadingByCommunity[communityId()] ?? false,
    );
  }

  /** Group layout for the community, including ungrouped and collapsed ids. */
  channelGroups(communityId: Accessor<string>): Accessor<ChannelGroupState> {
    return createMemo(() => projectChannelGroups(this.state, communityId()));
  }

  channelPermissions(
    channelId: Accessor<string | null>,
  ): Accessor<ChannelPermissionsSnapshot | null> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsByChannel[id] ?? null) : null;
    });
  }

  channelPermissionsLoading(
    channelId: Accessor<string | null>,
  ): Accessor<boolean> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsLoadingByChannel[id] ?? false) : false;
    });
  }

  channelPermissionsError(
    channelId: Accessor<string | null>,
  ): Accessor<string | null> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsErrorsByChannel[id] ?? null) : null;
    });
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
    this.permissionsInflight.clear();
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

  async createChannel(input: {
    communityId: string;
    name: string;
    topic: string | null;
    kind: ChannelKind;
  }): Promise<HavenChannel> {
    const channels = projectChannels(this.state, input.communityId);
    const nextPosition =
      channels.length === 0
        ? 0
        : Math.max(...channels.map((channel) => channel.position)) + 1;
    const raw = await this.communityData.createChannel({
      ...input,
      position: nextPosition,
    });
    this.upsertChannel(raw);
    this.setActiveChannelId(raw.id);
    return this.state.entities[raw.id]!.data;
  }

  async updateChannel(input: {
    communityId: string;
    channelId: string;
    name: string;
    topic: string | null;
  }): Promise<void> {
    await this.communityData.updateChannel(input);
    if (this.state.entities[input.channelId]) {
      this.setState("entities", input.channelId, "data", "name", input.name);
      this.setState("entities", input.channelId, "data", "topic", input.topic);
      this.persist();
    }
  }

  async deleteChannel(input: {
    communityId: string;
    channelId: string;
  }): Promise<void> {
    const channelIds = this.state.byCommunity[input.communityId] ?? [];
    if (channelIds.length <= 1) {
      throw new Error("At least one channel must exist in a community.");
    }
    await this.communityData.deleteChannel(input);
    this.removeChannel(input.channelId, input.communityId);
    if (this.state.activeChannelId === input.channelId) {
      const nextId =
        (this.state.byCommunity[input.communityId] ?? [])[0] ?? null;
      this.setActiveChannelId(nextId);
    }
  }

  async createChannelGroup(
    communityId: string,
    name: string,
    createdByUserId: string,
    channelIdToAssign?: string | null,
  ): Promise<void> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Group name is required.");

    const groups = projectChannelGroups(this.state, communityId).groups;
    const nextPosition =
      groups.length === 0
        ? 0
        : Math.max(...groups.map((group) => group.position)) + 1;
    const createdGroup = await this.communityData.createChannelGroup({
      communityId,
      name: normalizedName,
      position: nextPosition,
      createdByUserId,
    });

    if (channelIdToAssign) {
      await this.communityData.setChannelGroupForChannel({
        communityId,
        channelId: channelIdToAssign,
        groupId: createdGroup.id,
        position: 0,
      });
    }
    await this.loadForCommunity(communityId);
  }

  async renameChannelGroup(
    communityId: string,
    groupId: string,
    name: string,
  ): Promise<void> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Group name is required.");
    await this.communityData.renameChannelGroup({
      communityId,
      groupId,
      name: normalizedName,
    });
    this.setState("groups", communityId, (groups = []) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, name: normalizedName } : group,
      ),
    );
    this.persist();
  }

  async deleteChannelGroup(
    communityId: string,
    groupId: string,
  ): Promise<void> {
    await this.communityData.deleteChannelGroup({ communityId, groupId });
    this.setGroupCollapsed(communityId, groupId, false);
    await this.loadForCommunity(communityId);
  }

  async assignChannelToGroup(
    communityId: string,
    channelId: string,
    groupId: string,
  ): Promise<void> {
    const group = projectChannelGroups(this.state, communityId).groups.find(
      (candidate) => candidate.id === groupId,
    );
    if (!group) throw new Error("Channel group not found.");
    await this.communityData.setChannelGroupForChannel({
      communityId,
      channelId,
      groupId,
      position: group.channelIds.length,
    });
    await this.loadForCommunity(communityId);
  }

  async removeChannelFromGroup(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    await this.communityData.setChannelGroupForChannel({
      communityId,
      channelId,
      groupId: null,
      position: 0,
    });
    await this.loadForCommunity(communityId);
  }

  async setChannelGroupCollapsed(
    communityId: string,
    groupId: string,
    isCollapsed: boolean,
  ): Promise<void> {
    await this.communityData.setChannelGroupCollapsed({
      communityId,
      groupId,
      isCollapsed,
    });
    this.setGroupCollapsed(communityId, groupId, isCollapsed);
  }

  async loadChannelPermissions(input: {
    communityId: string;
    channelId: string;
    userId: string;
  }): Promise<ChannelPermissionsSnapshot> {
    const existing = this.permissionsInflight.get(input.channelId);
    if (existing) return existing;

    const promise = (async () => {
      this.setState("permissionsLoadingByChannel", input.channelId, true);
      this.setState("permissionsErrorsByChannel", input.channelId, null);
      try {
        const snapshot =
          await this.communityData.fetchChannelPermissions(input);
        this.setState("permissionsByChannel", input.channelId, snapshot);
        return snapshot;
      } catch (error) {
        this.setState(
          "permissionsErrorsByChannel",
          input.channelId,
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to load channel permissions.",
        );
        this.setState("permissionsByChannel", input.channelId, undefined);
        throw error;
      } finally {
        this.setState("permissionsLoadingByChannel", input.channelId, false);
        this.permissionsInflight.delete(input.channelId);
      }
    })();

    this.permissionsInflight.set(input.channelId, promise);
    return promise;
  }

  async saveRoleChannelPermissions(input: {
    communityId: string;
    channelId: string;
    roleId: string;
    permissions: ChannelPermissionState;
  }): Promise<void> {
    const row = this.state.permissionsByChannel[
      input.channelId
    ]?.rolePermissions.find((candidate) => candidate.roleId === input.roleId);
    if (row && !row.editable) {
      throw new Error(
        "You can only edit overwrites for roles below your highest role.",
      );
    }
    await this.communityData.saveRoleChannelPermissions(input);
    this.setState(
      "permissionsByChannel",
      input.channelId,
      "rolePermissions",
      (rows = []) =>
        rows.map((candidate) =>
          candidate.roleId === input.roleId
            ? { ...candidate, ...input.permissions }
            : candidate,
        ),
    );
  }

  async saveMemberChannelPermissions(input: {
    communityId: string;
    channelId: string;
    memberId: string;
    permissions: ChannelPermissionState;
  }): Promise<ChannelAccessRevokedResult | null> {
    const result = await this.communityData.saveMemberChannelPermissions(input);
    const memberOption = this.state.permissionsByChannel[
      input.channelId
    ]?.memberOptions.find((candidate) => candidate.memberId === input.memberId);
    this.setState(
      "permissionsByChannel",
      input.channelId,
      "memberPermissions",
      (rows = []) => {
        if (rows.some((candidate) => candidate.memberId === input.memberId)) {
          return rows.map((candidate) =>
            candidate.memberId === input.memberId
              ? { ...candidate, ...input.permissions }
              : candidate,
          );
        }
        return memberOption
          ? [...rows, { ...memberOption, ...input.permissions }]
          : rows;
      },
    );
    return result;
  }

  setGroupCollapsed(
    communityId: string,
    groupId: string,
    collapsed: boolean,
  ): void {
    const current = this.state.collapsed[communityId] ?? [];
    const has = current.includes(groupId);
    if (collapsed === has) return;
    this.setState(
      "collapsed",
      communityId,
      collapsed
        ? [...current, groupId]
        : current.filter((id) => id !== groupId),
    );
    this.persist();
  }

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
    const belongsToGroup = (this.state.groups[channel.communityId] ?? []).some(
      (group) => group.channelIds.includes(channel.id),
    );
    const ungroupedIds = this.state.ungrouped[channel.communityId] ?? [];
    if (!belongsToGroup && !ungroupedIds.includes(channel.id)) {
      this.setState("ungrouped", channel.communityId, [
        ...ungroupedIds,
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
    this.setState("permissionsByChannel", id, undefined!);
    this.setState("permissionsLoadingByChannel", id, undefined!);
    this.setState("permissionsErrorsByChannel", id, undefined!);
    this.persist();
  }

  removeCommunity(communityId: string): void {
    for (const channelId of this.state.byCommunity[communityId] ?? []) {
      this.setState("entities", channelId, undefined!);
      this.setState("permissionsByChannel", channelId, undefined!);
      this.setState("permissionsLoadingByChannel", channelId, undefined!);
      this.setState("permissionsErrorsByChannel", channelId, undefined!);
    }
    this.setState("byCommunity", communityId, undefined!);
    this.setState("groups", communityId, undefined!);
    this.setState("ungrouped", communityId, undefined!);
    this.setState("collapsed", communityId, undefined!);
    this.setState("loadingByCommunity", communityId, undefined!);
    this.setState("lastChannelByCommunity", communityId, undefined!);
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
