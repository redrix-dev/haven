import type { NexusEntry } from "@shared/core/cache/entityTypes";
import { NEXUS_STORAGE_KEYS } from "@shared/core/persistence/nexusStorageKeys";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  Channel,
  ChannelAccessRevokedResult,
  ChannelGroupState,
  ChannelKind,
  ChannelPermissionState,
  ChannelPermissionsSnapshot,
} from "@shared/lib/backend/types";
import { messageFromError } from "../kit/errors";
import { createLoadGate } from "../kit/loadGate";
import { omitKey } from "../kit/records";
import type { StatePort } from "../kit/statePort";
import { projectChannelGroups, projectChannels } from "./channelSelectors";
import type { ChannelState, HavenChannel } from "./channelTypes";

export const createInitialChannelState = (): ChannelState => ({
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
});

export const toHavenChannel = (raw: Channel): HavenChannel => ({
  id: raw.id,
  communityId: raw.community_id,
  name: raw.name,
  kind: raw.kind,
  position: raw.position,
  topic: raw.topic,
  createdAt: raw.created_at,
});

const cachedEntry = (channel: HavenChannel): NexusEntry<HavenChannel> => ({
  data: channel,
  partial: false,
  cachedAt: Date.now(),
});

const without = (ids: readonly string[] | undefined, id: string) =>
  (ids ?? []).filter((candidate) => candidate !== id);

type PersistedChannels = Pick<
  ChannelState,
  | "entities"
  | "byCommunity"
  | "groups"
  | "ungrouped"
  | "collapsed"
  | "activeChannelId"
  | "lastChannelByCommunity"
>;

/**
 * Channels and channel groups per community, the focused channel, the last
 * channel visited in each community, and the channel permission editor.
 */
export class ChannelNexus {
  private readonly channelLoads = createLoadGate();
  private readonly permissionLoads = createLoadGate();

  constructor(
    protected readonly port: StatePort<ChannelState>,
    private readonly persistence: NexusPersistence,
    private readonly communityData: CommunityDataBackend,
  ) {}

  // ─── reads ─────────────────────────────────────────────────────────────────

  getChannel(id: string): HavenChannel | undefined {
    return this.port.get().entities[id]?.data;
  }

  /** The channels of a community in sidebar order. */
  getChannels(communityId: string): HavenChannel[] {
    return projectChannels(this.port.get(), communityId);
  }

  getActiveChannelId(): string | null {
    return this.port.get().activeChannelId;
  }

  /** The channel last focused in a community, to restore on return. */
  getLastChannelId(communityId: string): string | null {
    return this.port.get().lastChannelByCommunity[communityId] ?? null;
  }

  /** The first text channel — where a community opens with no history. */
  getDefaultChannelId(communityId: string): string | null {
    return (
      this.getChannels(communityId).find((channel) => channel.kind === "text")
        ?.id ?? null
    );
  }

  // ─── loading ───────────────────────────────────────────────────────────────

  /** Fetch channels and groups for a community and replace its entries. */
  loadForCommunity(communityId: string): Promise<void> {
    return this.channelLoads.run(communityId, async (stale) => {
      this.setFlag("loadingByCommunity", communityId, true);
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
        if (stale()) return;
        this.setChannels(communityId, channels, groupState);
      } finally {
        if (!stale()) this.setFlag("loadingByCommunity", communityId, false);
      }
    });
  }

  /** Load a community's channels unless they are already cached (rehydrated counts). */
  async ensureLoaded(communityId: string): Promise<void> {
    if ((this.port.get().byCommunity[communityId] ?? []).length > 0) return;
    await this.loadForCommunity(communityId);
  }

  // ─── channel commands ──────────────────────────────────────────────────────

  async createChannel(input: {
    communityId: string;
    name: string;
    topic: string | null;
    kind: ChannelKind;
  }): Promise<HavenChannel> {
    const channels = this.getChannels(input.communityId);
    const position =
      channels.length === 0
        ? 0
        : Math.max(...channels.map((channel) => channel.position)) + 1;
    const raw = await this.communityData.createChannel({ ...input, position });
    this.upsertChannel(raw);
    this.setActiveChannelId(raw.id);
    return toHavenChannel(raw);
  }

  async updateChannel(input: {
    communityId: string;
    channelId: string;
    name: string;
    topic: string | null;
  }): Promise<void> {
    await this.communityData.updateChannel(input);
    this.patchChannel(input.channelId, {
      name: input.name,
      topic: input.topic,
    });
  }

  /** Delete a channel; if it was focused, focus moves to the community's first channel. */
  async deleteChannel(input: {
    communityId: string;
    channelId: string;
  }): Promise<void> {
    if ((this.port.get().byCommunity[input.communityId] ?? []).length <= 1) {
      throw new Error("At least one channel must exist in a community.");
    }
    await this.communityData.deleteChannel(input);
    const wasActive = this.port.get().activeChannelId === input.channelId;
    this.removeChannel(input.channelId, input.communityId);
    if (wasActive) {
      this.setActiveChannelId(
        this.port.get().byCommunity[input.communityId]?.[0] ?? null,
      );
    }
  }

  // ─── group commands ────────────────────────────────────────────────────────

  async createChannelGroup(
    communityId: string,
    name: string,
    createdByUserId: string,
    channelIdToAssign?: string | null,
  ): Promise<void> {
    const normalizedName = requireName(name);
    const { groups } = projectChannelGroups(this.port.get(), communityId);
    const position =
      groups.length === 0
        ? 0
        : Math.max(...groups.map((group) => group.position)) + 1;
    const createdGroup = await this.communityData.createChannelGroup({
      communityId,
      name: normalizedName,
      position,
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
    const normalizedName = requireName(name);
    await this.communityData.renameChannelGroup({
      communityId,
      groupId,
      name: normalizedName,
    });
    const state = this.port.get();
    this.port.set({
      groups: {
        ...state.groups,
        [communityId]: (state.groups[communityId] ?? []).map((group) =>
          group.id === groupId ? { ...group, name: normalizedName } : group,
        ),
      },
    });
    this.persist();
  }

  async deleteChannelGroup(
    communityId: string,
    groupId: string,
  ): Promise<void> {
    await this.communityData.deleteChannelGroup({ communityId, groupId });
    // A deleted group must not linger in the collapsed list.
    this.setGroupCollapsed(communityId, groupId, false);
    await this.loadForCommunity(communityId);
  }

  async assignChannelToGroup(
    communityId: string,
    channelId: string,
    groupId: string,
  ): Promise<void> {
    const group = projectChannelGroups(
      this.port.get(),
      communityId,
    ).groups.find((candidate) => candidate.id === groupId);
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

  /** Local collapse state (persisted); `setChannelGroupCollapsed` also saves it server-side. */
  setGroupCollapsed(
    communityId: string,
    groupId: string,
    collapsed: boolean,
  ): void {
    const state = this.port.get();
    const current = state.collapsed[communityId] ?? [];
    if (collapsed === current.includes(groupId)) return;
    this.port.set({
      collapsed: {
        ...state.collapsed,
        [communityId]: collapsed
          ? [...current, groupId]
          : without(current, groupId),
      },
    });
    this.persist();
  }

  // ─── channel permission editor ─────────────────────────────────────────────

  loadChannelPermissions(input: {
    communityId: string;
    channelId: string;
    userId: string;
  }): Promise<ChannelPermissionsSnapshot> {
    const { channelId } = input;
    return this.permissionLoads.run(channelId, async (stale) => {
      this.setChannelPermissionStatus(channelId, true, null);
      try {
        const snapshot =
          await this.communityData.fetchChannelPermissions(input);
        if (stale()) return snapshot;
        this.port.set({
          permissionsByChannel: {
            ...this.port.get().permissionsByChannel,
            [channelId]: snapshot,
          },
        });
        return snapshot;
      } catch (error) {
        if (stale()) throw error;
        this.port.set({
          permissionsByChannel: omitKey(
            this.port.get().permissionsByChannel,
            channelId,
          ),
        });
        this.setChannelPermissionStatus(
          channelId,
          true,
          messageFromError(error, "Failed to load channel permissions."),
        );
        throw error;
      } finally {
        this.setFlag("permissionsLoadingByChannel", channelId, false);
      }
    });
  }

  async saveRoleChannelPermissions(input: {
    communityId: string;
    channelId: string;
    roleId: string;
    permissions: ChannelPermissionState;
  }): Promise<void> {
    const snapshot = this.port.get().permissionsByChannel[input.channelId];
    const row = snapshot?.rolePermissions.find(
      (candidate) => candidate.roleId === input.roleId,
    );
    if (row && !row.editable) {
      throw new Error(
        "You can only edit overwrites for roles below your highest role.",
      );
    }
    await this.communityData.saveRoleChannelPermissions(input);
    this.updatePermissionSnapshot(input.channelId, (current) => ({
      ...current,
      rolePermissions: current.rolePermissions.map((candidate) =>
        candidate.roleId === input.roleId
          ? { ...candidate, ...input.permissions }
          : candidate,
      ),
    }));
  }

  async saveMemberChannelPermissions(input: {
    communityId: string;
    channelId: string;
    memberId: string;
    permissions: ChannelPermissionState;
  }): Promise<ChannelAccessRevokedResult | null> {
    const result = await this.communityData.saveMemberChannelPermissions(input);
    this.updatePermissionSnapshot(input.channelId, (current) => {
      const exists = current.memberPermissions.some(
        (candidate) => candidate.memberId === input.memberId,
      );
      if (exists) {
        return {
          ...current,
          memberPermissions: current.memberPermissions.map((candidate) =>
            candidate.memberId === input.memberId
              ? { ...candidate, ...input.permissions }
              : candidate,
          ),
        };
      }
      const option = current.memberOptions.find(
        (candidate) => candidate.memberId === input.memberId,
      );
      return option
        ? {
            ...current,
            memberPermissions: [
              ...current.memberPermissions,
              { ...option, ...input.permissions },
            ],
          }
        : current;
    });
    return result;
  }

  // ─── local writes (load results, realtime, focus) ──────────────────────────

  setChannels(
    communityId: string,
    channels: Channel[],
    groupState: ChannelGroupState,
  ): void {
    const state = this.port.get();
    const entities = { ...state.entities };
    const orderedIds: string[] = [];
    for (const raw of [...channels].sort((a, b) => a.position - b.position)) {
      entities[raw.id] = cachedEntry(toHavenChannel(raw));
      orderedIds.push(raw.id);
    }
    this.port.set({
      entities,
      byCommunity: { ...state.byCommunity, [communityId]: orderedIds },
      groups: { ...state.groups, [communityId]: groupState.groups },
      ungrouped: {
        ...state.ungrouped,
        [communityId]: groupState.ungroupedChannelIds,
      },
      collapsed: {
        ...state.collapsed,
        // Local collapse choices win over the server default once made.
        [communityId]:
          state.collapsed[communityId] ?? groupState.collapsedGroupIds,
      },
      loadingByCommunity: { ...state.loadingByCommunity, [communityId]: false },
    });
    this.persist();
  }

  /**
   * Insert or replace one channel (realtime, or after create). A new channel
   * that belongs to no group joins the ungrouped list so the sidebar shows it.
   */
  upsertChannel(raw: Channel | unknown): void {
    const channel = toHavenChannel(raw as Channel);
    const { communityId, id } = channel;
    const state = this.port.get();
    const communityIds = state.byCommunity[communityId] ?? [];
    const inGroup = (state.groups[communityId] ?? []).some((group) =>
      group.channelIds.includes(id),
    );
    const ungroupedIds = state.ungrouped[communityId] ?? [];
    this.port.set({
      entities: { ...state.entities, [id]: cachedEntry(channel) },
      byCommunity: communityIds.includes(id)
        ? state.byCommunity
        : { ...state.byCommunity, [communityId]: [...communityIds, id] },
      ungrouped:
        inGroup || ungroupedIds.includes(id)
          ? state.ungrouped
          : { ...state.ungrouped, [communityId]: [...ungroupedIds, id] },
    });
    this.persist();
  }

  /** Patch a cached channel's fields locally, after the backend already applied the change. */
  patchChannel(id: string, changes: Partial<HavenChannel>): void {
    const state = this.port.get();
    const existing = state.entities[id];
    if (!existing) return;
    this.port.set({
      entities: {
        ...state.entities,
        [id]: {
          ...existing,
          data: { ...existing.data, ...changes },
          cachedAt: Date.now(),
        },
      },
    });
    this.persist();
  }

  removeChannel(id: string, communityId: string): void {
    const state = this.port.get();
    this.port.set({
      entities: omitKey(state.entities, id),
      byCommunity: {
        ...state.byCommunity,
        [communityId]: without(state.byCommunity[communityId], id),
      },
      ungrouped: {
        ...state.ungrouped,
        [communityId]: without(state.ungrouped[communityId], id),
      },
      groups: {
        ...state.groups,
        [communityId]: (state.groups[communityId] ?? []).map((group) => ({
          ...group,
          channelIds: without(group.channelIds, id),
        })),
      },
      activeChannelId:
        state.activeChannelId === id ? null : state.activeChannelId,
      ...this.withoutPermissionEditor(state, [id]),
    });
    this.persist();
  }

  /** Forget everything about a community the viewer left or lost. */
  removeCommunity(communityId: string): void {
    const state = this.port.get();
    const channelIds = state.byCommunity[communityId] ?? [];
    // A load answering after this would put the community back.
    this.channelLoads.forget(communityId);
    for (const channelId of channelIds) this.permissionLoads.forget(channelId);
    const entities = { ...state.entities };
    for (const channelId of channelIds) delete entities[channelId];
    this.port.set({
      entities,
      byCommunity: omitKey(state.byCommunity, communityId),
      groups: omitKey(state.groups, communityId),
      ungrouped: omitKey(state.ungrouped, communityId),
      collapsed: omitKey(state.collapsed, communityId),
      loadingByCommunity: omitKey(state.loadingByCommunity, communityId),
      lastChannelByCommunity: omitKey(
        state.lastChannelByCommunity,
        communityId,
      ),
      ...this.withoutPermissionEditor(state, channelIds),
    });
    this.persist();
  }

  /** Focus a channel and remember it as the last visited in its community. */
  setActiveChannelId(id: string | null): void {
    const state = this.port.get();
    if (state.activeChannelId === id) return;
    const communityId = id ? state.entities[id]?.data.communityId : undefined;
    this.port.set({
      activeChannelId: id,
      ...(communityId && id
        ? {
            lastChannelByCommunity: {
              ...state.lastChannelByCommunity,
              [communityId]: id,
            },
          }
        : {}),
    });
    this.persist();
  }

  // ─── persistence + lifecycle ───────────────────────────────────────────────

  rehydrate(): void {
    try {
      const raw = this.persistence.getString(NEXUS_STORAGE_KEYS.channels);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedChannels>;
      this.port.set({
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
      console.warn("[ChannelNexus] Failed to rehydrate", error);
      this.persistence.remove(NEXUS_STORAGE_KEYS.channels);
    }
  }

  clear(): void {
    this.channelLoads.clear();
    this.permissionLoads.clear();
    this.port.set(createInitialChannelState());
    this.persistence.remove(NEXUS_STORAGE_KEYS.channels);
  }

  private persist(): void {
    try {
      const state = this.port.get();
      const persisted: PersistedChannels = {
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
        JSON.stringify(persisted),
      );
    } catch (error) {
      console.warn("[ChannelNexus] Failed to persist", error);
    }
  }

  private setFlag(
    flag: "loadingByCommunity" | "permissionsLoadingByChannel",
    key: string,
    value: boolean,
  ): void {
    const next = { ...this.port.get()[flag], [key]: value };
    // A computed key from a union widens to an index signature; the cast restores it.
    this.port.set({ [flag]: next } as Partial<ChannelState>);
  }

  private setChannelPermissionStatus(
    channelId: string,
    loading: boolean,
    error: string | null,
  ): void {
    const state = this.port.get();
    this.port.set({
      permissionsLoadingByChannel: {
        ...state.permissionsLoadingByChannel,
        [channelId]: loading,
      },
      permissionsErrorsByChannel: {
        ...state.permissionsErrorsByChannel,
        [channelId]: error,
      },
    });
  }

  private updatePermissionSnapshot(
    channelId: string,
    update: (current: ChannelPermissionsSnapshot) => ChannelPermissionsSnapshot,
  ): void {
    const current = this.port.get().permissionsByChannel[channelId];
    if (!current) return;
    this.port.set({
      permissionsByChannel: {
        ...this.port.get().permissionsByChannel,
        [channelId]: update(current),
      },
    });
  }

  private withoutPermissionEditor(
    state: ChannelState,
    channelIds: readonly string[],
  ): Pick<
    ChannelState,
    | "permissionsByChannel"
    | "permissionsLoadingByChannel"
    | "permissionsErrorsByChannel"
  > {
    const drop = <V>(record: Record<string, V>) => {
      const next = { ...record };
      for (const channelId of channelIds) delete next[channelId];
      return next;
    };
    return {
      permissionsByChannel: drop(state.permissionsByChannel),
      permissionsLoadingByChannel: drop(state.permissionsLoadingByChannel),
      permissionsErrorsByChannel: drop(state.permissionsErrorsByChannel),
    };
  }
}

function requireName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Group name is required.");
  return normalized;
}
