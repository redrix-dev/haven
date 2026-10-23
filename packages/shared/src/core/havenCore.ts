import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type {
  VoiceRealtimeChannel,
  VoiceRealtimeTransport,
} from "@shared/features/voice/types";
import type { ParseHavenLinkOptions } from "@shared/features/links/havenLinks";
import type {
  DirectMessage,
  MessageReportTarget,
  OnboardingClientContext,
  OnboardingCompletionResult,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";
import { bootLogger } from "@shared/debug/bootLogger";
import type { ChannelNexus } from "@shared/nexus/channels/channelNexus";
import type { CommunityNexus } from "@shared/nexus/communities/communityNexus";
import type { CommunityAdminNexus } from "@shared/nexus/community-management/communityAdminNexus";
import type { CommunityModerationNexus } from "@shared/nexus/community-management/communityModerationNexus";
import type { DirectMessageNexus } from "@shared/nexus/direct-messages/directMessageNexus";
import type { FeatureFlagNexus } from "@shared/nexus/feature-flags/featureFlagNexus";
import type { CommunityMessageNexus } from "@shared/nexus/messages/communityMessageNexus";
import type { CommunityMessageRegistry } from "@shared/nexus/messages/communityMessageRegistry";
import type { NotificationNexus } from "@shared/nexus/notifications/notificationNexus";
import type { OnboardingNexus } from "@shared/nexus/onboarding/onboardingNexus";
import type { PermissionsNexus } from "@shared/nexus/permissions/permissionsNexus";
import type { ProfileNexus } from "@shared/nexus/profile/profileNexus";
import type { SocialNexus } from "@shared/nexus/social/socialNexus";
import type { VoiceNexus } from "@shared/nexus/voice/voiceNexus";
import {
  createHavenBackends,
  type HavenBackends,
  type HavenSupabasePublicConfig,
} from "./backends";
import {
  BootstrapPhase,
  type BootstrapPhaseListener,
  type BootstrapPhaseSnapshot,
} from "./bootstrapPhase";
import {
  resolvePreferredChannelIdForServer,
  toChannel,
} from "./communityChannelUtils";
import { createLinkPipeline, type LinkPipeline } from "./linkPipeline";
import type { NexusPersistence } from "./persistence/NexusPersistence";
import type { RealtimeMutationTarget } from "./realtimeMutationTarget";
import { routeRealtimeEvent, type RealtimeEvent } from "./routeRealtimeEvent";
import type { UiStoreState } from "./sessionStorePorts";
import {
  createDefaultViewerMessagePolicyState,
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
  type ViewerMessagePolicyStore,
} from "./viewerMessagePolicy";

const WARM_FRESHNESS_MS = 60_000;
const DM_WARM_LIMIT = 3;
const ADJACENT_CHANNEL_WARM_LIMIT = 2;

/**
 * What a platform builds for the core: its binding of every shared nexus and
 * its session stores. Each platform passes its own binding classes, so
 * `core.channels` on Solid is the Solid binding with its accessors, and on
 * mobile the React binding with its store.
 */
export type HavenParts = {
  communities: CommunityNexus;
  channels: ChannelNexus;
  messages: CommunityMessageRegistry<CommunityMessageNexus>;
  directMessages: DirectMessageNexus;
  notifications: NotificationNexus;
  onboarding: OnboardingNexus;
  social: SocialNexus;
  permissions: PermissionsNexus;
  featureFlags: FeatureFlagNexus;
  profiles: ProfileNexus;
  admin: CommunityAdminNexus;
  moderation: CommunityModerationNexus;
  voice: VoiceNexus;
  viewerMessagePolicyStore: ViewerMessagePolicyStore;
  authStore: unknown;
  uiStore: { getState(): UiStoreState };
};

export type HavenPartsContext = {
  backends: HavenBackends;
  persistence: NexusPersistence;
  voiceRealtime: VoiceRealtimeTransport;
};

export type HavenCoreOptions = {
  client: HavenSupabaseClient;
  publicConfig: HavenSupabasePublicConfig;
  persistence: NexusPersistence;
};

/** The viewer lost access to a community: kicked, banned, or it was deleted. */
export type CommunityAccessLoss = {
  communityId: string;
  communityName: string;
  /** It was the community on screen; the core has already focused another. */
  wasActive: boolean;
  /** The viewer is in one of its voice channels; the platform should leave. */
  inVoice: boolean;
};

export type HavenPlatform<P extends HavenParts> = {
  createParts(context: HavenPartsContext): P;
  /** Extra origins whose links count as app links (web serves on its own origin). */
  linkParse?: ParseHavenLinkOptions;
  /** A notification just arrived over realtime (desktop plays a sound). */
  onNotificationArrived?: () => void;
};

/**
 * The session's composition root, shared by every platform: it owns the
 * nexuses, starts and ends the signed-in session, routes realtime events, and
 * runs the commands that touch more than one nexus. Platforms subclass it only
 * to supply their nexus bindings and stores (HavenSolidCore, HavenReactCore).
 *
 * It assumes auth has already established a Supabase session; sign-in,
 * sign-out and recovery belong to the auth boundary, which calls
 * bootstrapSession and clearSession.
 */
export class HavenCore<
  P extends HavenParts = HavenParts,
> implements RealtimeMutationTarget {
  readonly backends: HavenBackends;
  readonly persistence: NexusPersistence;
  /**
   * Every incoming link (see linkPipeline). Outlives sessions: it remembers a
   * link clicked while signed out and opens it after sign-in.
   */
  readonly links: LinkPipeline;
  readonly communities: P["communities"];
  readonly channels: P["channels"];
  readonly messages: P["messages"];
  readonly directMessages: P["directMessages"];
  readonly notifications: P["notifications"];
  readonly onboarding: P["onboarding"];
  readonly social: P["social"];
  readonly permissions: P["permissions"];
  readonly featureFlags: P["featureFlags"];
  readonly profiles: P["profiles"];
  readonly admin: P["admin"];
  readonly moderation: P["moderation"];
  readonly voice: P["voice"];
  readonly viewerMessagePolicyStore: P["viewerMessagePolicyStore"];
  readonly authStore: P["authStore"];
  readonly uiStore: P["uiStore"];

  private readonly phase = new BootstrapPhase();
  private readonly accessLossListeners = new Set<
    (loss: CommunityAccessLoss) => void
  >();
  /** Losses found before any UI subscribed (at bootstrap); given to the first subscriber. */
  private undeliveredAccessLosses: CommunityAccessLoss[] = [];
  private readonly onNotificationArrived: (() => void) | null;
  private realtimeUnsubscribe: (() => void) | null = null;
  private sessionUserId: string | null = null;

  constructor(options: HavenCoreOptions, platform: HavenPlatform<P>) {
    this.persistence = options.persistence;
    this.backends = createHavenBackends(options.client, options.publicConfig);
    this.links = createLinkPipeline({
      persistence: options.persistence,
      parse: platform.linkParse,
    });
    this.onNotificationArrived = platform.onNotificationArrived ?? null;

    const parts = platform.createParts({
      backends: this.backends,
      persistence: options.persistence,
      voiceRealtime: createVoiceRealtimeTransport(this.backends.client),
    });
    this.communities = parts.communities;
    this.channels = parts.channels;
    this.messages = parts.messages;
    this.directMessages = parts.directMessages;
    this.notifications = parts.notifications;
    this.onboarding = parts.onboarding;
    this.social = parts.social;
    this.permissions = parts.permissions;
    this.featureFlags = parts.featureFlags;
    this.profiles = parts.profiles;
    this.admin = parts.admin;
    this.moderation = parts.moderation;
    this.voice = parts.voice;
    this.viewerMessagePolicyStore = parts.viewerMessagePolicyStore;
    this.authStore = parts.authStore;
    this.uiStore = parts.uiStore;

    this.messages.setBackends(this.backends);
    // Blocks and permissions decide whose messages the viewer sees.
    this.social.setPolicySyncCallback(() => this.syncViewerMessagePolicy());
    this.permissions.setPolicySyncCallback((communityId) =>
      this.syncViewerMessagePolicy(communityId),
    );
    // A reload that drops a community means access was taken away.
    this.communities.setOnMembershipLost((lost) =>
      this.handleLostCommunities(lost),
    );
  }

  // ─── session lifecycle ─────────────────────────────────────────────────────

  /**
   * Start the signed-in session: restore cached state, load communities and
   * their permissions, load the rest of the session's data, then connect
   * realtime. Failed loads are logged and skipped; only an unexpected throw
   * puts the phase in `error`.
   */
  async bootstrapSession(userId: string): Promise<void> {
    if (!userId) throw new Error("bootstrapSession requires a userId");
    this.sessionUserId = userId;

    try {
      this.phase.set("rehydrating");
      this.communities.rehydrate();
      this.communities.loadDisplayOrder(userId);
      this.channels.rehydrate();
      this.directMessages.rehydrate();
      this.notifications.rehydrate();
      bootLogger.mark("bootstrap-rehydrated");

      this.phase.set("loading_communities");
      bootLogger.mark("bootstrap-communities-start");
      try {
        await this.communities.load(userId);
      } catch (error) {
        // The rehydrated list stays; the nexus records the error for the UI.
        console.warn("[HavenCore] communities.load failed", error);
      }
      bootLogger.mark("bootstrap-communities-done");

      const joinedIds = new Set(this.communities.getCommunityIds());
      for (const id of Object.keys(
        this.permissions.getPermissionsByCommunityId(),
      )) {
        if (!joinedIds.has(id)) this.permissions.invalidate(id);
      }
      if (joinedIds.size > 0) {
        bootLogger.mark("bootstrap-permissions-start", {
          count: joinedIds.size,
        });
        await Promise.allSettled(
          Array.from(joinedIds, (id) => this.ensureCommunityPermissions(id)),
        );
        bootLogger.mark("bootstrap-permissions-done");
      }

      this.phase.set("loading_session_data");
      bootLogger.mark("bootstrap-session-data-start");
      const activeCommunityId = this.communities.getActiveId();
      await Promise.allSettled([
        this.profiles.ensureViewerProfile(userId),
        this.profiles.ensurePlatformStaff(userId),
        this.featureFlags.load(),
        this.directMessages.ensureConversationsLoaded(),
        this.notifications.ensureInbox(),
        this.notifications.ensurePreferences(),
        this.social.ensureLoaded(),
      ]);
      bootLogger.mark("bootstrap-session-data-done");
      this.syncViewerMessagePolicy(activeCommunityId);

      this.phase.set("connecting_realtime");
      bootLogger.mark("bootstrap-realtime-start");
      this.subscribeRealtime(userId);
      bootLogger.mark("bootstrap-realtime-done");

      this.phase.set("ready");
      bootLogger.mark("bootstrap-ready");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.error("[HavenCore] bootstrapSession failed", error);
      this.phase.set("error", message);
      throw error;
    }
  }

  /**
   * End the session's domain state: realtime off, every nexus cleared. The
   * auth boundary ends the Supabase session itself and calls this after.
   */
  async clearSession(): Promise<void> {
    this.unsubscribeRealtime();
    this.sessionUserId = null;
    this.communities.clear();
    this.channels.clear();
    this.messages.clearAll();
    this.directMessages.clear();
    this.notifications.clear();
    this.onboarding.reset();
    this.social.clear();
    this.permissions.clear();
    this.featureFlags.reset();
    this.profiles.clear();
    this.admin.clear();
    this.moderation.clear();
    this.voice.clear();
    this.viewerMessagePolicyStore.setState(
      createDefaultViewerMessagePolicyState(),
    );
    this.uiStore.getState().reset();
    this.undeliveredAccessLosses = [];
    this.phase.set("idle");
  }

  getBootstrapPhase(): BootstrapPhaseSnapshot {
    return this.phase.get();
  }

  subscribeBootstrapPhase(listener: BootstrapPhaseListener): () => void {
    return this.phase.subscribe(listener);
  }

  /**
   * Be told when the viewer loses access to a community. By then the core has
   * already forgotten the community and moved focus; the platform shows a
   * notice and leaves voice. Losses found before anyone subscribed (kicked
   * while the app was closed) go to the first subscriber.
   */
  subscribeCommunityAccessLost(
    listener: (loss: CommunityAccessLoss) => void,
  ): () => void {
    this.accessLossListeners.add(listener);
    const undelivered = this.undeliveredAccessLosses;
    this.undeliveredAccessLosses = [];
    for (const loss of undelivered) listener(loss);
    return () => {
      this.accessLossListeners.delete(listener);
    };
  }

  // ─── realtime ──────────────────────────────────────────────────────────────

  routeEvent(event: RealtimeEvent): void {
    routeRealtimeEvent(this, event);
  }

  subscribeRealtime(userId: string): () => void {
    this.unsubscribeRealtime();
    this.realtimeUnsubscribe =
      this.backends.controlPlane.subscribeToPrivateUserChannel(
        userId,
        (event) => this.routeEvent(event as RealtimeEvent),
      );
    return () => this.unsubscribeRealtime();
  }

  /**
   * Roles or channel overwrites changed for the viewer: refresh permissions,
   * and the channel list, since a channel may now be hidden or newly visible.
   * Messages of channels that disappeared are dropped from the cache.
   */
  onRoleChange(communityId: string): void {
    this.permissions.invalidate(communityId);
    void this.permissions
      .ensureLoaded(communityId)
      .then(() => this.syncViewerMessagePolicy(communityId));

    const before = this.channels.getChannels(communityId).map((c) => c.id);
    void this.channels
      .loadForCommunity(communityId)
      .then(() => {
        const after = new Set(
          this.channels.getChannels(communityId).map((c) => c.id),
        );
        const messages = this.messages.for(communityId);
        for (const channelId of before) {
          if (!after.has(channelId)) messages.evictChannel(channelId);
        }
        // The channel on screen was hidden: move to the community's default.
        const activeId = this.channels.getActiveChannelId();
        if (activeId && before.includes(activeId) && !after.has(activeId)) {
          this.channels.setActiveChannelId(
            this.channels.getDefaultChannelId(communityId),
          );
        }
      })
      .catch((error) => {
        console.warn(
          "[HavenCore] channel reload after role change failed",
          error,
        );
      });
  }

  onNotificationEvent(_payload: Record<string, unknown>): void {
    this.onNotificationArrived?.();
    void this.notifications
      .loadInbox()
      // The inbox load also refreshes counts; then surface the newest as a toast.
      .then(() => this.notifications.markIncomingFromNewest())
      .catch((error) => {
        console.warn("[HavenCore] notifications.loadInbox failed", error);
      });
  }

  onDmConversationEvent(_payload: Record<string, unknown>): void {
    void this.directMessages.loadConversations().catch((error) => {
      console.warn(
        "[HavenCore] directMessages.loadConversations failed",
        error,
      );
    });
  }

  onDmMessageEvent(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id;
    if (typeof conversationId !== "string") return;
    const messageId = payload.message_id;
    if (typeof messageId !== "string") {
      // Older payloads carry no message id; fetch the newest instead.
      void this.directMessages.receiveLatest(conversationId).catch((error) => {
        console.warn("[HavenCore] directMessages.receiveLatest failed", error);
      });
      return;
    }
    // Show the payload's copy at once; the fetch fills in author and attachments.
    const partial = directMessageFromRealtimePayload(
      conversationId,
      messageId,
      payload,
    );
    if (partial) this.directMessages.upsertMessage(partial);
    void this.directMessages
      .receiveMessage(conversationId, messageId)
      .catch((error) => {
        console.warn("[HavenCore] directMessages.receiveMessage failed", error);
      });
  }

  onSocialChange(payload: Record<string, unknown>): void {
    this.social.handleSocialChange(payload);
    this.syncViewerMessagePolicy();
  }

  // ─── viewer message policy ─────────────────────────────────────────────────

  /**
   * Recompute whose messages the viewer sees (blocks, the mod "show hidden"
   * toggle, and the community's elevation and revoked authors) into the
   * policy store every message nexus filters through.
   */
  syncViewerMessagePolicy(communityId?: string | null): void {
    const activeCommunityId =
      communityId ?? this.communities.getActiveId() ?? null;
    const hiddenAuthorIds = this.social.getHiddenAuthorIdsForViewer();
    const showHiddenMessages = this.uiStore.getState().showHiddenMessages;

    const prev = this.viewerMessagePolicyStore.getState();
    const communities = { ...prev.communities };
    if (activeCommunityId) {
      const permissions = this.permissions.getPermissions(activeCommunityId);
      communities[activeCommunityId] = {
        suppressAuthorFilter: this.permissions.isElevated(activeCommunityId),
        canViewBanHidden: permissions.canViewBanHidden,
        revokedAuthorIdsByChannel:
          this.permissions.getRevokedAuthorIdsByChannel(activeCommunityId),
      };
    }

    const unchanged =
      viewerPolicyHiddenAuthorIdsEqual(prev.hiddenAuthorIds, hiddenAuthorIds) &&
      prev.showHiddenMessages === showHiddenMessages &&
      viewerCommunityPolicyEqual(
        activeCommunityId ? prev.communities[activeCommunityId] : undefined,
        activeCommunityId ? communities[activeCommunityId] : undefined,
      );
    if (unchanged) return;

    this.viewerMessagePolicyStore.setState({
      hiddenAuthorIds,
      showHiddenMessages,
      communities,
    });
  }

  async ensureCommunityPermissions(communityId: string): Promise<void> {
    await this.permissions.ensureLoaded(communityId);
    this.syncViewerMessagePolicy(communityId);
  }

  // ─── preparing and warming screens ─────────────────────────────────────────

  /**
   * Get a community ready to show: channels, permissions, the channel to
   * focus, and that channel's first page of messages.
   */
  async prepareCommunityEntry(
    communityId: string,
    options?: { lastVisitedChannelId?: string | null },
  ): Promise<{ channelId: string | null }> {
    await this.channels.ensureLoaded(communityId);
    try {
      await this.ensureCommunityPermissions(communityId);
    } catch (error) {
      console.warn("[HavenCore] ensureCommunityPermissions failed", error);
    }

    const channelId = resolvePreferredChannelIdForServer(
      this.channels.getChannels(communityId).map(toChannel),
      {
        lastVisitedChannelId: options?.lastVisitedChannelId,
        previousChannelId: this.channels.getActiveChannelId(),
        lastChannelId: this.channels.getLastChannelId(communityId),
        defaultChannelId: this.channels.getDefaultChannelId(communityId),
      },
    );
    this.communities.setActiveId(communityId);
    this.channels.setActiveChannelId(channelId);
    if (channelId)
      await this.prepareTextChannelMessages(communityId, channelId);
    return { channelId };
  }

  /**
   * Get a text channel ready to show: the viewer policy, its revoked authors,
   * and its first page of messages (deduped by the message nexus).
   */
  async prepareTextChannelMessages(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    this.syncViewerMessagePolicy(communityId);
    if (this.channels.getChannel(channelId)?.kind !== "text") return;

    const messageNexus = this.messages.for(communityId);
    if (!messageNexus.isCommunityDataAttached()) return;

    try {
      await this.permissions.loadRevokedAuthorIdsForChannel(
        communityId,
        channelId,
      );
      this.syncViewerMessagePolicy(communityId);
    } catch (error) {
      console.warn("[HavenCore] loadRevokedAuthorIdsForChannel failed", error);
    }

    await messageNexus.ensureInitialLoaded(channelId);
    // Current author identities, so avatars render fresh. Never blocks messages.
    void this.primeMessageAuthorProfiles(communityId, channelId);
  }

  /** Get a DM thread ready to show: its messages, and mark it read unless told not to. */
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

  /** Preload what the first screens after sign-in show. Failures are logged and skipped. */
  async warmSessionSurfaces(userId: string): Promise<void> {
    if (!userId.trim()) return;
    const fresh = { freshnessMs: WARM_FRESHNESS_MS };

    await Promise.all([
      warm("viewer profile", () =>
        this.profiles.ensureViewerProfile(userId, fresh),
      ),
      warm("platform staff", () =>
        this.profiles.ensurePlatformStaff(userId, fresh),
      ),
    ]);
    await warm("notification inbox", () =>
      this.notifications.ensureInbox(fresh),
    );
    await warm("notification preferences", () =>
      this.notifications.ensurePreferences(fresh),
    );
    await warm("social state", () => this.social.ensureLoaded(fresh));
    await warm("direct message inbox", () =>
      this.directMessages.ensureConversationsLoaded(fresh),
    );
    await this.warmDirectMessageThreads({ unreadOnly: true });
  }

  /** Preload the newest DM threads (unread ones by default). */
  async warmDirectMessageThreads(options?: {
    limit?: number;
    unreadOnly?: boolean;
    freshnessMs?: number;
  }): Promise<void> {
    const limit = Math.max(0, options?.limit ?? DM_WARM_LIMIT);
    if (limit === 0) return;

    await warm("direct message conversations", () =>
      this.directMessages.ensureConversationsLoaded({
        freshnessMs: WARM_FRESHNESS_MS,
      }),
    );
    const conversations = this.directMessages
      .getConversations()
      .filter(
        (conversation) =>
          options?.unreadOnly === false || conversation.unreadCount > 0,
      )
      .slice(0, limit);
    await Promise.all(
      conversations.map((conversation) =>
        warm(`direct message thread ${conversation.conversationId}`, () =>
          this.directMessages.ensureMessagesLoaded(
            conversation.conversationId,
            {
              freshnessMs: options?.freshnessMs,
            },
          ),
        ),
      ),
    );
  }

  /**
   * Preload a community: channels, permissions, the focused channel's
   * messages, and (unless turned off) its nearest neighbours' messages.
   */
  async warmCommunitySurface(
    communityId: string,
    options?: { includeAdjacentChannels?: boolean },
  ): Promise<void> {
    if (!communityId.trim()) return;

    await warm(`community ${communityId} channels`, () =>
      this.channels.ensureLoaded(communityId),
    );
    await warm(`community ${communityId} permissions`, () =>
      this.ensureCommunityPermissions(communityId),
    );

    const channelList = this.channels.getChannels(communityId).map(toChannel);
    const activeChannelId = this.channels.getActiveChannelId();
    const activeBelongsToCommunity =
      activeChannelId != null &&
      channelList.some((channel) => channel.id === activeChannelId);
    const channelId = activeBelongsToCommunity
      ? activeChannelId
      : resolvePreferredChannelIdForServer(channelList, {
          previousChannelId: activeChannelId,
          lastChannelId: this.channels.getLastChannelId(communityId),
          defaultChannelId: this.channels.getDefaultChannelId(communityId),
        });

    this.communities.setActiveId(communityId);
    this.channels.setActiveChannelId(channelId);
    if (!channelId) return;

    await warm(`community ${communityId} active channel`, () =>
      this.prepareTextChannelMessages(communityId, channelId),
    );
    if (options?.includeAdjacentChannels === false) return;

    const textChannelIds = channelList
      .filter((channel) => channel.kind === "text")
      .map((channel) => channel.id);
    const activeIndex = textChannelIds.indexOf(channelId);
    if (activeIndex === -1) return;
    const adjacentIds = [
      textChannelIds[activeIndex - 1],
      textChannelIds[activeIndex + 1],
      textChannelIds[activeIndex - 2],
      textChannelIds[activeIndex + 2],
    ].filter((id): id is string => Boolean(id));

    void Promise.all(
      adjacentIds
        .slice(0, ADJACENT_CHANNEL_WARM_LIMIT)
        .map((adjacentChannelId) =>
          warm(`community ${communityId} channel ${adjacentChannelId}`, () =>
            this.prepareTextChannelMessages(communityId, adjacentChannelId),
          ),
        ),
    );
  }

  // ─── commands across nexuses ───────────────────────────────────────────────

  /** Create a community, reload the list, and focus the new one. */
  async createCommunity(name: string): Promise<{ id: string }> {
    const userId = this.requireUserId();
    const community = await this.admin.createCommunity(name);
    await this.communities.load(userId);
    this.communities.setActiveId(community.id);
    return community;
  }

  /** Redeem an invite, reload the list, and focus the joined community. */
  async joinCommunityByInvite(
    code: string,
  ): Promise<{ communityId: string; communityName: string; joined: boolean }> {
    const userId = this.requireUserId();
    const result = await this.admin.redeemCommunityInvite(code);
    await this.communities.load(userId);
    this.communities.setActiveId(result.communityId);
    return {
      communityId: result.communityId,
      communityName: result.communityName,
      joined: result.joined,
    };
  }

  async saveCommunitySettings(input: {
    communityId: string;
    values: ServerSettingsUpdate;
  }): Promise<void> {
    const userId = this.requireUserId();
    await this.admin.saveServerSettings(input);
    await this.communities.load(userId);
  }

  async renameCommunity(communityId: string, name: string): Promise<void> {
    const userId = this.requireUserId();
    await this.admin.renameCommunity(communityId, name);
    await Promise.all([
      this.communities.load(userId),
      this.admin.loadServerSettings(communityId),
    ]);
  }

  async leaveCommunity(communityId: string): Promise<void> {
    const userId = this.requireUserId();
    await this.admin.leaveCommunity(communityId);
    await this.removeCommunityFromSession(communityId, userId);
  }

  async deleteCommunity(communityId: string): Promise<void> {
    const userId = this.requireUserId();
    await this.admin.deleteCommunity(communityId);
    await this.removeCommunityFromSession(communityId, userId);
  }

  /**
   * Complete an onboarding campaign, then refresh what it may have changed:
   * the community list, the viewer's profile and flairs, and (if it joined a
   * community) focus and permissions for that community.
   */
  async completeOnboarding(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    const result = await this.onboarding.complete(campaignKey, context);
    const userId = this.sessionUserId;

    if (userId) {
      await this.communities.load(userId);
      await this.profiles.ensureViewerProfile(userId).catch((error) => {
        console.warn("[HavenCore] onboarding profile refresh failed", error);
      });
      await this.profiles.loadMyUserFlairs(userId).catch((error) => {
        console.warn("[HavenCore] onboarding flair refresh failed", error);
      });
    }
    if (result.communityId) {
      this.communities.setActiveId(result.communityId);
      await this.ensureCommunityPermissions(result.communityId).catch(
        (error) => {
          console.warn("[HavenCore] onboarding permissions failed", error);
        },
      );
    }
    return result;
  }

  /**
   * File a report about a user. `target` picks who reviews it: the
   * community's moderators, Haven staff, or both. Without a target it goes to
   * the community when one is given, otherwise to Haven staff.
   */
  async reportUserProfile(input: {
    targetUserId: string;
    reporterUserId: string;
    reason: string;
    communityId?: string | null;
    target?: MessageReportTarget;
  }): Promise<void> {
    const target =
      input.target ?? (input.communityId ? "server_admins" : "haven_staff");
    const report = {
      targetUserId: input.targetUserId,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
    };

    if (
      input.communityId &&
      (target === "server_admins" || target === "both")
    ) {
      await this.backends.communityData.reportUserProfile({
        ...report,
        communityId: input.communityId,
      });
    }
    if (target === "haven_staff" || target === "both") {
      await this.backends.communityData.reportPlatformUserProfile(report);
    }
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private requireUserId(): string {
    if (!this.sessionUserId) throw new Error("Not authenticated");
    return this.sessionUserId;
  }

  private unsubscribeRealtime(): void {
    if (!this.realtimeUnsubscribe) return;
    try {
      this.realtimeUnsubscribe();
    } catch (error) {
      console.warn("[HavenCore] realtime unsubscribe failed", error);
    }
    this.realtimeUnsubscribe = null;
  }

  /** Forget everything about a community the viewer just left or deleted. */
  private async removeCommunityFromSession(
    communityId: string,
    userId: string,
  ): Promise<void> {
    const wasActive = this.communities.getActiveId() === communityId;
    // Removed locally first, so the reload below doesn't report it as lost.
    this.forgetCommunity(communityId);
    this.communities.removeCommunity(communityId);
    await this.communities.load(userId);
    if (wasActive) this.focusFirstCommunity();
    this.syncViewerMessagePolicy(this.communities.getActiveId());
  }

  /** A reload dropped these communities: forget them, refocus, tell the platform. */
  private handleLostCommunities(lost: { id: string; name: string }[]): void {
    const activeId = this.communities.getActiveId();
    const voiceCommunityId =
      this.voice.getSnapshot().activeChannel?.community_id ?? null;

    const losses = lost.map((community) => {
      this.forgetCommunity(community.id);
      return {
        communityId: community.id,
        communityName: community.name,
        wasActive: community.id === activeId,
        inVoice: community.id === voiceCommunityId,
      };
    });
    if (losses.some((loss) => loss.wasActive)) this.focusFirstCommunity();
    this.syncViewerMessagePolicy(this.communities.getActiveId());

    for (const loss of losses) {
      if (this.accessLossListeners.size === 0) {
        this.undeliveredAccessLosses.push(loss);
        continue;
      }
      for (const listener of this.accessLossListeners) listener(loss);
    }
  }

  /** Drop everything cached about a community (memory and device storage). */
  private forgetCommunity(communityId: string): void {
    this.admin.clearCommunity(communityId);
    this.channels.removeCommunity(communityId);
    this.messages.clearCommunity(communityId);
    this.permissions.invalidate(communityId);
  }

  private focusFirstCommunity(): void {
    this.communities.setActiveId(this.communities.getCommunityIds()[0] ?? null);
  }

  /**
   * Fetch current identities for a channel's message authors not cached yet.
   * The render path prefers a live profile over a message's avatar snapshot,
   * so stale or blank avatars resolve without a restart.
   */
  private async primeMessageAuthorProfiles(
    communityId: string,
    channelId: string,
  ): Promise<void> {
    try {
      const authorIds = this.messages
        .for(communityId)
        .getChannelAuthorIds(channelId)
        .filter((id) => this.profiles.getProfile(id) === undefined);
      if (authorIds.length === 0) return;
      const profiles =
        await this.backends.communityData.fetchMessageAuthorProfiles({
          communityId,
          authorUserIds: authorIds,
        });
      this.profiles.upsertProfiles(profiles);
    } catch (error) {
      console.warn("[HavenCore] primeMessageAuthorProfiles failed", error);
    }
  }
}

/** Run one warm-up step; a failure is logged and the warm-up carries on. */
async function warm(
  label: string,
  task: () => Promise<unknown>,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.warn(`[HavenCore warm-up] ${label} failed`, error);
  }
}

/** Voice's presence and kick channels ride the Supabase client's realtime. */
function createVoiceRealtimeTransport(
  client: HavenSupabaseClient,
): VoiceRealtimeTransport {
  return {
    channel: (topic, channelOptions) =>
      client.channel(
        topic,
        channelOptions as never,
      ) as unknown as VoiceRealtimeChannel,
    removeChannel: (channel) => client.removeChannel(channel as never),
    getChannels: () =>
      client.getChannels() as unknown as VoiceRealtimeChannel[],
  };
}

const normalizeRealtimeIso = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

/** The DM a realtime payload describes, or null when it lacks a timestamp or content. */
function directMessageFromRealtimePayload(
  conversationId: string,
  messageId: string,
  payload: Record<string, unknown>,
): DirectMessage | null {
  const createdAt = normalizeRealtimeIso(payload.created_at);
  if (!createdAt || typeof payload.content !== "string") return null;
  const metadata = payload.metadata;
  return {
    messageId,
    conversationId,
    authorUserId:
      typeof payload.author_user_id === "string" ? payload.author_user_id : "",
    authorUsername: "",
    authorAvatarUrl: null,
    content: payload.content,
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {},
    createdAt,
    editedAt: normalizeRealtimeIso(payload.edited_at),
    deletedAt: normalizeRealtimeIso(payload.deleted_at),
    attachments: [],
  };
}
