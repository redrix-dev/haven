import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import {
  createHavenBackends,
  type HavenBackends,
  type HavenSupabasePublicConfig,
} from "@shared/core/backends";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  routeRealtimeEvent,
  type RealtimeEvent,
} from "@shared/core/routeRealtimeEvent";
import type { RealtimeMutationTarget } from "@shared/core/realtimeMutationTarget";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyStore,
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
} from "@shared/core/viewerMessagePolicy";
import {
  registerSessionBackends,
  resetSessionBackends,
} from "@shared/lib/backend/sessionBackendRegistry";
import type {
  DirectMessage,
  MessageReportTarget,
  OnboardingClientContext,
  OnboardingCompletionResult,
  ServerSettingsUpdate,
} from "@shared/lib/backend/types";
import {
  CommunitySolidNexus,
  createCommunitySolidNexus,
  ChannelSolidNexus,
  createChannelSolidNexus,
  SocialSolidNexus,
  createSocialSolidNexus,
  ProfileSolidNexus,
  createProfileSolidNexus,
  PermissionsSolidNexus,
  createPermissionsSolidNexus,
  FeatureFlagSolidNexus,
  createFeatureFlagSolidNexus,
  DirectMessageSolidNexus,
  createDirectMessageSolidNexus,
  NotificationSolidNexus,
  createNotificationSolidNexus,
  OnboardingSolidNexus,
  createOnboardingSolidNexus,
  CommunityAdminSolidNexus,
  createCommunityAdminSolidNexus,
  CommunityModerationSolidNexus,
  createCommunityModerationSolidNexus,
  VoiceSolidNexus,
  createVoiceSolidNexus,
  createMessageSolidRegistry,
  type MessageSolidRegistry,
  createSolidAuthSessionStore,
  createSolidUiSessionStore,
  createSolidViewerMessagePolicyStore,
} from "@solid-client/data";
import {
  BootstrapPhase,
  type BootstrapPhaseListener,
  type BootstrapPhaseSnapshot,
} from "./bootstrapPhase";
import { playNotificationSound } from "@solid-client/audio/sounds";

const normalizeRealtimeIso = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const realtimeMetadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const directMessageFromRealtimePayload = (
  conversationId: string,
  messageId: string,
  payload: Record<string, unknown>,
): DirectMessage | null => {
  const createdAt = normalizeRealtimeIso(payload.created_at);
  if (!createdAt || typeof payload.content !== "string") return null;
  return {
    messageId,
    conversationId,
    authorUserId:
      typeof payload.author_user_id === "string" ? payload.author_user_id : "",
    authorUsername: "",
    authorAvatarUrl: null,
    content: payload.content,
    metadata: realtimeMetadata(payload.metadata),
    createdAt,
    editedAt: normalizeRealtimeIso(payload.edited_at),
    deletedAt: normalizeRealtimeIso(payload.deleted_at),
    attachments: [],
  };
};

export type HavenSolidCoreOptions = {
  client: HavenSupabaseClient;
  publicConfig: HavenSupabasePublicConfig;
  persistence: NexusPersistence;
};

/**
 * Solid-platform session-scoped composition root (Tauri desktop + web).
 * Mirrors HavenReactCore: orchestration + realtime routing; caches are Solid-native.
 */
export class HavenSolidCore implements RealtimeMutationTarget {
  readonly backends: HavenBackends;
  readonly persistence: NexusPersistence;
  readonly communities: CommunitySolidNexus;
  readonly channels: ChannelSolidNexus;
  readonly messages: MessageSolidRegistry;
  readonly directMessages: DirectMessageSolidNexus;
  readonly notifications: NotificationSolidNexus;
  readonly onboarding: OnboardingSolidNexus;
  readonly social: SocialSolidNexus;
  readonly permissions: PermissionsSolidNexus;
  readonly featureFlags: FeatureFlagSolidNexus;
  readonly profiles: ProfileSolidNexus;
  readonly admin: CommunityAdminSolidNexus;
  readonly moderation: CommunityModerationSolidNexus;
  readonly voice: VoiceSolidNexus;
  readonly viewerMessagePolicyStore: ViewerMessagePolicyStore;
  readonly authStore: ReturnType<typeof createSolidAuthSessionStore>;
  readonly uiStore: ReturnType<typeof createSolidUiSessionStore>;

  private readonly phase = new BootstrapPhase();
  private realtimeUnsubscribe: (() => void) | null = null;
  private sessionUserId: string | null = null;

  constructor(options: HavenSolidCoreOptions) {
    this.persistence = options.persistence;
    this.backends = createHavenBackends(options.client, options.publicConfig);
    registerSessionBackends(this.backends);

    this.authStore = createSolidAuthSessionStore();
    this.uiStore = createSolidUiSessionStore();
    this.viewerMessagePolicyStore = createSolidViewerMessagePolicyStore();

    this.communities = createCommunitySolidNexus(
      options.persistence,
      this.backends.controlPlane,
    );
    this.channels = createChannelSolidNexus(
      options.persistence,
      this.backends.communityData,
    );
    this.messages = createMessageSolidRegistry(
      options.persistence,
      this.viewerMessagePolicyStore,
    );
    this.directMessages = createDirectMessageSolidNexus(
      options.persistence,
      this.backends.directMessages,
    );
    this.notifications = createNotificationSolidNexus(
      options.persistence,
      this.backends.notifications,
    );
    this.onboarding = createOnboardingSolidNexus(this.backends.controlPlane);
    this.social = createSocialSolidNexus(this.backends.social);
    this.permissions = createPermissionsSolidNexus();
    this.featureFlags = createFeatureFlagSolidNexus(this.backends.controlPlane);
    this.profiles = createProfileSolidNexus(this.backends.controlPlane);
    this.admin = createCommunityAdminSolidNexus(
      this.backends.communityData,
      this.backends.controlPlane,
    );
    this.moderation = createCommunityModerationSolidNexus(
      options.persistence,
      this.backends.serverModmail,
    );
    this.voice = createVoiceSolidNexus(
      this.viewerMessagePolicyStore,
      this.backends.voiceToken,
      {
        channel: (topic, channelOptions) =>
          this.backends.client.channel(
            topic,
            channelOptions as never,
          ) as unknown as import("@shared/features/voice/types").VoiceRealtimeChannel,
        removeChannel: (channel) =>
          this.backends.client.removeChannel(channel as never),
        getChannels: () =>
          this.backends.client.getChannels() as unknown as import("@shared/features/voice/types").VoiceRealtimeChannel[],
      },
    );

    this.messages.setBackends(this.backends);

    this.social.setPolicySyncCallback(() => {
      this.syncViewerMessagePolicy();
    });
    this.permissions.setPolicySyncCallback((communityId: string) => {
      this.syncViewerMessagePolicy(communityId);
    });
  }

  routeEvent(evt: RealtimeEvent): void {
    routeRealtimeEvent(this, evt);
  }

  subscribeRealtime(userId: string): () => void {
    this.unsubscribeRealtime();
    const unsubscribe =
      this.backends.controlPlane.subscribeToPrivateUserChannel(
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
        console.warn("[HavenSolidCore] realtime unsubscribe failed", err);
      }
      this.realtimeUnsubscribe = null;
    }
  }

  syncViewerMessagePolicy(communityId?: string | null): void {
    const activeCommunityId =
      communityId ?? this.communities.getActiveId() ?? null;
    const hiddenAuthorIds = this.social.getHiddenAuthorIdsForViewer();
    const showHiddenMessages = this.uiStore.getState().showHiddenMessages;

    const prev = this.viewerMessagePolicyStore.getState();
    const communities = { ...prev.communities };

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
      ? prev.communities[activeCommunityId]
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
        await Promise.allSettled(
          Array.from(joinedIds).map((id) =>
            this.ensureCommunityPermissions(id),
          ),
        );
      }

      this.phase.set("loading_session_data");
      const activeCommunityId = this.communities.getActiveId();
      await Promise.allSettled([
        this.directMessages.ensureConversationsLoaded(),
        this.notifications.ensureInbox(),
        this.social.ensureLoaded(),
        this.featureFlags.load(),
      ]);
      this.syncViewerMessagePolicy(activeCommunityId);

      this.phase.set("connecting_realtime");
      this.subscribeRealtime(userId);

      this.phase.set("ready");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.error("[HavenSolidCore] bootstrapSession failed", error);
      this.phase.set("error", message);
      throw error;
    }
  }

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
    resetSessionBackends();
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
    playNotificationSound();
    void this.notifications
      .loadInbox()
      .then(() => {
        // Surface the freshly-arrived notification as a toast. loadInbox already
        // refreshed counts, so no separate refresh is needed.
        this.notifications.markIncomingFromNewest();
      })
      .catch((err) => {
        console.warn("[HavenSolidCore] notifications.loadInbox failed", err);
      });
  }

  onDmConversationEvent(_payload: Record<string, unknown>): void {
    void this.directMessages.loadConversations().catch((err) => {
      console.warn(
        "[HavenSolidCore] directMessages.loadConversations failed",
        err,
      );
    });
  }

  onDmMessageEvent(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id;
    const messageId = payload.message_id;
    if (typeof conversationId === "string") {
      if (typeof messageId === "string") {
        const partial = directMessageFromRealtimePayload(
          conversationId,
          messageId,
          payload,
        );
        if (partial) {
          this.directMessages.upsertMessage(partial);
        }
        void this.directMessages
          .receiveMessage(conversationId, messageId)
          .catch((err) => {
            console.warn(
              "[HavenSolidCore] directMessages.receiveMessage failed",
              err,
            );
          });
      } else {
        void this.directMessages.loadConversations().catch((err) => {
          console.warn(
            "[HavenSolidCore] directMessages.loadConversations failed",
            err,
          );
        });
      }
    }
  }

  onSocialChange(payload: Record<string, unknown>): void {
    this.social.handleSocialChange(payload);
    this.syncViewerMessagePolicy();
  }

  async ensureCommunityPermissions(communityId: string): Promise<void> {
    await this.permissions.ensureLoaded(
      communityId,
      this.backends.communityData,
    );
    this.syncViewerMessagePolicy(communityId);
  }

  async completeOnboarding(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult> {
    const result = await this.onboarding.complete(campaignKey, context);
    // If completing the campaign joined a community, surface it right away.
    if (result.joined && this.sessionUserId) {
      await this.communities.load(this.sessionUserId);
    }
    return result;
  }

  async createCommunity(name: string): Promise<{ id: string }> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    const community = await this.admin.createCommunity(name);
    await this.communities.load(userId);
    this.communities.setActiveId(community.id);
    return community;
  }

  async joinCommunityByInvite(
    code: string,
  ): Promise<{ communityId: string; communityName: string; joined: boolean }> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    const result = await this.admin.redeemCommunityInvite(code);
    await this.communities.load(userId);
    this.communities.setActiveId(result.communityId);
    return result;
  }

  async saveCommunitySettings(input: {
    communityId: string;
    values: ServerSettingsUpdate;
  }): Promise<void> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    await this.admin.saveServerSettings(input);
    await this.communities.load(userId);
  }

  async renameCommunity(communityId: string, name: string): Promise<void> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    await this.admin.renameCommunity(communityId, name);
    await Promise.all([
      this.communities.load(userId),
      this.admin.loadServerSettings(communityId),
    ]);
  }

  async leaveCommunity(communityId: string): Promise<void> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    await this.admin.leaveCommunity(communityId);
    await this.removeCommunityFromSession(communityId, userId);
  }

  async deleteCommunity(communityId: string): Promise<void> {
    const userId = this.sessionUserId;
    if (!userId) throw new Error("Not authenticated");
    await this.admin.deleteCommunity(communityId);
    await this.removeCommunityFromSession(communityId, userId);
  }

  private async removeCommunityFromSession(
    communityId: string,
    userId: string,
  ): Promise<void> {
    const wasActive = this.communities.getActiveId() === communityId;
    this.admin.clearCommunity(communityId);
    this.channels.removeCommunity(communityId);
    this.messages.clearCommunity(communityId);
    this.permissions.invalidate(communityId);
    this.communities.removeCommunity(communityId);
    await this.communities.load(userId);
    if (wasActive) {
      this.communities.setActiveId(
        this.communities.getCommunityIds()[0] ?? null,
      );
    }
    this.syncViewerMessagePolicy(this.communities.getActiveId());
  }

  /**
   * File a user-account report. Mirrors mobile's core method, extended for the
   * target choice: `server_admins` → community mods, `haven_staff` → platform,
   * `both` → both. Community routing needs `communityId`; platform routing never
   * does (DMs/profile reports are platform-only).
   */
  async reportUserProfile(input: {
    targetUserId: string;
    reporterUserId: string;
    reason: string;
    communityId?: string | null;
    target: MessageReportTarget;
  }): Promise<void> {
    const toCommunity =
      !!input.communityId &&
      (input.target === "server_admins" || input.target === "both");
    const toPlatform =
      input.target === "haven_staff" || input.target === "both";

    if (toCommunity) {
      await this.backends.communityData.reportUserProfile({
        communityId: input.communityId!,
        targetUserId: input.targetUserId,
        reporterUserId: input.reporterUserId,
        reason: input.reason,
      });
    }
    if (toPlatform) {
      await this.backends.communityData.reportPlatformUserProfile({
        targetUserId: input.targetUserId,
        reporterUserId: input.reporterUserId,
        reason: input.reason,
      });
    }
  }
}
