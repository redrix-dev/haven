import type { HavenSupabaseClient } from "@shared/infrastructure/client/createHavenSupabaseClient";
import { hydrateCommunityPermissionsForMany } from "@shared/features/community/communityPermissionsHydration";
import {
  CommunityNexus,
} from "@shared/nexus/community/CommunityNexus";
import {
  ChannelNexus,
} from "@shared/nexus/community/ChannelNexus";
import { CommunityAdminNexus } from "@shared/nexus/community/CommunityAdminNexus";
import { CommunityMessageNexus } from "@shared/nexus/community/CommunityMessageNexus";
import { DirectMessageNexus } from "@shared/nexus/direct-messages/DirectMessageNexus";
import { NotificationNexus } from "@shared/nexus/notifications/NotificationNexus";
import { SocialNexus } from "@shared/nexus/social/SocialNexus";
import { PermissionsNexus } from "@shared/nexus/permissions/PermissionsNexus";
import { ProfileNexus } from "@shared/nexus/profile/ProfileNexus";
import { VoiceNexus } from "@shared/nexus/voice/VoiceNexus";
import { useUiStore } from "@shared/stores/uiStore";
import { getCommunityDataBackend } from "@shared/lib/backend";
import { createHavenBackends, type HavenBackends, type HavenSupabasePublicConfig } from "./backends";
import { notifyActiveServerAccessLost } from "./communityAccessHandlers";
import { BootstrapPhase, type BootstrapPhaseSnapshot, type BootstrapPhaseListener } from "./bootstrapPhase";
import type { NexusPersistence } from "./persistence/NexusPersistence";
import { routeRealtimeEvent, type RealtimeEvent } from "./routeRealtimeEvent";
import {
  createDefaultViewerMessagePolicyState,
  createViewerMessagePolicyStore,
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
  type ViewerMessagePolicyStore,
} from "./viewerMessagePolicy";

export type HavenCoreOptions = {
  client: HavenSupabaseClient;
  publicConfig: HavenSupabasePublicConfig;
  persistence: NexusPersistence;
};

/**
 * Per-community message nexus registry. Lazy-created on first access and
 * owned by HavenCore so persistence is consistent and cleanup is centralized.
 */
class MessageNexusRegistry {
  private byCommunity = new Map<string, CommunityMessageNexus>();
  private backends: HavenBackends | null = null;

  constructor(
    private readonly persistence: NexusPersistence,
    private readonly viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {}

  setBackends(backends: HavenBackends): void {
    this.backends = backends;
    for (const nexus of this.byCommunity.values()) {
      nexus.setCommunityData(backends.communityData);
    }
  }

  for(communityId: string): CommunityMessageNexus {
    let nexus = this.byCommunity.get(communityId);
    if (!nexus) {
      nexus = new CommunityMessageNexus(
        communityId,
        this.persistence,
        this.viewerMessagePolicyStore,
      );
      if (this.backends) nexus.setCommunityData(this.backends.communityData);
      this.byCommunity.set(communityId, nexus);
    }
    return nexus;
  }

  has(communityId: string): boolean {
    return this.byCommunity.has(communityId);
  }

  clearCommunity(communityId: string): void {
    const nexus = this.byCommunity.get(communityId);
    if (nexus) {
      nexus.clear();
      this.byCommunity.delete(communityId);
    }
  }

  clearAll(): void {
    for (const [communityId] of this.byCommunity) {
      this.clearCommunity(communityId);
    }
  }
}

/**
 * The single session-scoped composition root.
 */
export class HavenCore {
  readonly backends: HavenBackends;
  readonly persistence: NexusPersistence;
  readonly communities: CommunityNexus;
  readonly channels: ChannelNexus;
  readonly admin: CommunityAdminNexus;
  readonly messages: MessageNexusRegistry;
  readonly directMessages: DirectMessageNexus;
  readonly notifications: NotificationNexus;
  readonly social: SocialNexus;
  readonly permissions: PermissionsNexus;
  readonly profiles: ProfileNexus;
  readonly voice: VoiceNexus;

  readonly viewerMessagePolicyStore: ViewerMessagePolicyStore;

  private readonly phase = new BootstrapPhase();
  private realtimeUnsubscribe: (() => void) | null = null;
  private sessionUserId: string | null = null;
  private lastNotifiedAccessLostCommunityId: string | null = null;

  constructor(options: HavenCoreOptions) {
    this.persistence = options.persistence;
    this.backends = createHavenBackends(options.client, options.publicConfig);
    this.viewerMessagePolicyStore = createViewerMessagePolicyStore();

    this.communities = new CommunityNexus(options.persistence);
    this.channels = new ChannelNexus(options.persistence);
    this.admin = new CommunityAdminNexus(options.persistence);
    this.messages = new MessageNexusRegistry(
      options.persistence,
      this.viewerMessagePolicyStore,
    );
    this.directMessages = new DirectMessageNexus(options.persistence);
    this.notifications = new NotificationNexus(options.persistence);
    this.social = new SocialNexus(options.persistence);
    this.permissions = new PermissionsNexus(options.persistence);
    this.profiles = new ProfileNexus(options.persistence);
    this.voice = new VoiceNexus(options.persistence);

    this.communities.setControlPlane(this.backends.controlPlane);
    this.admin.setControlPlane(this.backends.controlPlane);
    this.channels.setCommunityData(this.backends.communityData);
    this.messages.setBackends(this.backends);
    this.directMessages.setBackend(this.backends.directMessages);
    this.notifications.setBackend(this.backends.notifications);
    this.social.setBackend(this.backends.social);

    this.social.setPolicySyncCallback(() => {
      this.syncViewerMessagePolicy();
    });
    this.permissions.setPolicySyncCallback((communityId) => {
      this.syncViewerMessagePolicy(communityId);
    });
    this.voice.setViewerPolicyStore(this.viewerMessagePolicyStore);

    this.communities.setOnListChanged(() => {
      this.syncActiveCommunityAccess();
    });
  }

  /**
   * Notify host handlers when the active community disappears from the list.
   */
  syncActiveCommunityAccess(): void {
    if (this.communities.getIsLoading()) return;

    const communityIds = this.communities.getCommunityIds();
    const activeCommunityId = this.communities.getActiveId();
    if (!activeCommunityId) {
      this.lastNotifiedAccessLostCommunityId = null;
      return;
    }

    if (communityIds.includes(activeCommunityId)) {
      if (this.lastNotifiedAccessLostCommunityId === activeCommunityId) {
        this.lastNotifiedAccessLostCommunityId = null;
      }
      return;
    }

    if (communityIds.length === 0) {
      // Wait until a non-empty refresh confirms access loss vs transient load.
      return;
    }

    if (this.lastNotifiedAccessLostCommunityId === activeCommunityId) return;
    this.lastNotifiedAccessLostCommunityId = activeCommunityId;
    notifyActiveServerAccessLost(activeCommunityId);
  }

  async refreshCommunities(userId: string): Promise<void> {
    if (!userId) return;
    await this.communities.load(userId);
  }

  async createCommunity(userId: string, name: string): Promise<{ id: string }> {
    if (!userId) throw new Error("Not authenticated");
    const community = await this.backends.controlPlane.createCommunity(name);
    await this.refreshCommunities(userId);
    return community;
  }

  setCommunityDisplayOrder(ids: string[]): void {
    this.communities.setDisplayOrder(ids, this.sessionUserId);
  }

  resetCommunityDisplayOrder(): void {
    this.communities.resetDisplayOrder(this.sessionUserId);
  }

  routeEvent(evt: RealtimeEvent): void {
    routeRealtimeEvent(this, evt);
  }

  subscribeRealtime(userId: string): () => void {
    this.unsubscribeRealtime();

    const unsubscribe = this.backends.controlPlane.subscribeToPrivateUserChannel(
      userId,
      (evt) => {
        this.routeEvent(evt as RealtimeEvent);
      },
    );

    this.realtimeUnsubscribe = unsubscribe;
    return () => {
      this.unsubscribeRealtime();
    };
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeUnsubscribe) {
      try {
        this.realtimeUnsubscribe();
      } catch (err) {
        console.warn("[HavenCore] realtime unsubscribe failed", err);
      }
      this.realtimeUnsubscribe = null;
    }
  }

  /**
   * Sync viewer message policy from SocialNexus + PermissionsNexus + uiStore.
   * All CommunityMessageNexus instances share viewerMessagePolicyStore.
   */
  syncViewerMessagePolicy(communityId?: string | null): void {
    const activeCommunityId =
      communityId ?? this.communities.getActiveId() ?? null;
    const hiddenAuthorIds = this.social.getHiddenAuthorIdsForViewer();
    const showHiddenMessages = useUiStore.getState().showHiddenMessages;

    const prev = this.viewerMessagePolicyStore.getState();
    const prevCommunities = prev.communities;
    const communities = { ...prevCommunities };

    if (activeCommunityId) {
      const perms = this.permissions.getPermissions(activeCommunityId);
      communities[activeCommunityId] = {
        suppressAuthorFilter: this.permissions.isElevated(activeCommunityId),
        canViewBanHidden: perms.canViewBanHidden,
        revokedAuthorIdsByChannel:
          this.permissions.getRevokedAuthorIdsByChannel(activeCommunityId),
      };
    }

    const nextCommunityPolicy = activeCommunityId
      ? communities[activeCommunityId]
      : undefined;
    const prevCommunityPolicy = activeCommunityId
      ? prevCommunities[activeCommunityId]
      : undefined;

    if (
      viewerPolicyHiddenAuthorIdsEqual(prev.hiddenAuthorIds, hiddenAuthorIds) &&
      prev.showHiddenMessages === showHiddenMessages &&
      viewerCommunityPolicyEqual(prevCommunityPolicy, nextCommunityPolicy)
    ) {
      return;
    }

    this.viewerMessagePolicyStore.setState({
      hiddenAuthorIds,
      showHiddenMessages,
      communities,
    });
  }

  async bootstrapSession(userId: string): Promise<void> {
    if (!userId) {
      throw new Error("bootstrapSession requires a userId");
    }

    this.sessionUserId = userId;

    try {
      this.phase.set("rehydrating");
      this.communities.rehydrate();
      this.communities.loadDisplayOrder(userId);
      this.channels.rehydrate();
      this.directMessages.rehydrate();
      this.notifications.rehydrate();

      this.phase.set("loading_communities");
      await this.communities.load(userId);

      const joinedIds = new Set(this.communities.getCommunityIds());
      for (const id of Object.keys(
        this.permissions.getPermissionsByCommunityId(),
      )) {
        if (!joinedIds.has(id)) {
          this.permissions.invalidate(id);
        }
      }
      if (joinedIds.size > 0) {
        await hydrateCommunityPermissionsForMany(Array.from(joinedIds));
      }

      this.phase.set("loading_session_data");
      const activeCommunityId = this.communities.getActiveId();
      await Promise.allSettled([
        this.directMessages.loadConversations(),
        this.notifications.loadInbox().then(() =>
          this.notifications.refreshCounts(),
        ),
        this.notifications.loadPreferences(),
        this.social.load(),
      ]);
      this.syncViewerMessagePolicy(activeCommunityId);

      this.phase.set("connecting_realtime");
      this.subscribeRealtime(userId);

      this.phase.set("ready");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.error("[HavenCore] bootstrapSession failed", error);
      this.phase.set("error", message);
      throw error;
    }
  }

  async clearSession(): Promise<void> {
    this.lastNotifiedAccessLostCommunityId = null;
    this.unsubscribeRealtime();
    this.sessionUserId = null;
    this.communities.clear();
    this.channels.clear();
    this.admin.clear();
    this.messages.clearAll();
    this.directMessages.clear();
    this.notifications.clear();
    this.social.clear();
    this.permissions.clear();
    this.profiles.clear();
    this.voice.clear();
    this.viewerMessagePolicyStore.setState(
      createDefaultViewerMessagePolicyState(),
    );
    useUiStore.getState().reset();
    this.phase.set("idle");
  }

  getBootstrapPhase(): BootstrapPhaseSnapshot {
    return this.phase.get();
  }

  subscribeBootstrapPhase(listener: BootstrapPhaseListener): () => void {
    return this.phase.subscribe(listener);
  }

  onRoleChange(communityId: string): void {
    this.permissions.invalidate(communityId);
    void this.permissions
      .ensureLoaded(communityId, this.backends.communityData)
      .then(() => {
        this.syncViewerMessagePolicy(communityId);
      });
  }

  onNotificationEvent(_payload: Record<string, unknown>): void {
    void this.notifications.loadInbox().catch((err) => {
      console.warn("[HavenCore] notifications.loadInbox failed", err);
    });
    void this.notifications.refreshCounts().catch((err) => {
      console.warn("[HavenCore] notifications.refreshCounts failed", err);
    });
  }

  onDmConversationEvent(_payload: Record<string, unknown>): void {
    void this.directMessages.loadConversations().catch((err) => {
      console.warn("[HavenCore] directMessages.loadConversations failed", err);
    });
  }

  onDmMessageEvent(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id;
    if (typeof conversationId === "string") {
      void this.directMessages.loadMessages(conversationId).catch((err) => {
        console.warn("[HavenCore] directMessages.loadMessages failed", err);
      });
    }
    void this.directMessages.loadConversations().catch((err) => {
      console.warn("[HavenCore] directMessages.loadConversations failed", err);
    });
  }

  onSocialChange(payload: Record<string, unknown>): void {
    this.social.handleSocialChange(payload);
    this.syncViewerMessagePolicy();
  }

  /**
   * Prepare a focused text channel for display: viewer policy, revoked-author
   * ids, and initial message page (with freshness dedupe on the nexus).
   */
  async prepareTextChannelMessages(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    this.syncViewerMessagePolicy(communityId);

    const channel = this.channels.getChannel(channelId);
    if (channel?.kind !== "text") return;

    const messageNexus = this.messages.for(communityId);
    if (!messageNexus.isCommunityDataAttached()) return;

    try {
      await this.permissions.loadRevokedAuthorIdsForChannel(
        communityId,
        channelId,
        getCommunityDataBackend(communityId),
      );
      this.syncViewerMessagePolicy(communityId);
    } catch (err) {
      console.warn("[HavenCore] loadRevokedAuthorIds failed", err);
    }

    await messageNexus.ensureInitialLoaded(channelId);
  }

  /**
   * Prepare a focused DM thread: load messages and optionally mark read.
   */
  async prepareDirectMessageConversation(
    conversationId: string,
    options?: { markRead?: boolean; freshnessMs?: number },
  ): Promise<void> {
    await this.directMessages.ensureMessagesLoaded(conversationId, {
      freshnessMs: options?.freshnessMs,
    });
    if (options?.markRead !== false) {
      await this.directMessages.markRead(conversationId);
    }
  }
}
