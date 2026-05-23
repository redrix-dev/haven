import type { HavenCore } from "./HavenCore";
import { mapLiveProfileIdentity } from "@shared/lib/backend/controlPlaneBackend";
import type { MessageBundle, ReportStatusUpdatedBroadcastPayload } from "@shared/lib/backend/types";
import {
  notifyMemberBanned,
  notifyMemberChannelAccessRevoked,
} from "./communityAccessHandlers";

/**
 * The single realtime ingress for Haven.
 *
 * Every backend event lands here exactly once, regardless of host (web/electron/mobile).
 * HavenCore.subscribeRealtime invokes routeRealtimeEvent for every payload it receives.
 *
 * Rules (enforced by review + lint):
 *   - feature hooks do NOT subscribe to Supabase channels for migrated domains
 *   - this function is the ONLY caller that mutates nexuses from events
 *   - stores listed below are transitional; phases 3–5 replace each one with a Nexus
 */
export type RealtimeEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type RealtimeMessageSyncEvent = {
  type: "MESSAGE_INSERT" | "MESSAGE_UPDATE" | "MESSAGE_DELETE";
  communityId: string;
  channelId: string;
  messageId: string;
  message?: MessageBundle;
};

const normalizeCreatedAt = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
};

const createdAtBeforeCursor = (value: unknown): string | undefined => {
  const normalized = normalizeCreatedAt(value);
  if (!normalized) return undefined;
  return new Date(Date.parse(normalized) + 1).toISOString();
};

export function routeRealtimeEvent(core: HavenCore, evt: RealtimeEvent): void {
  switch (evt.type) {
    case "MESSAGE_INSERT": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      const messageId = evt.payload.message_id;
      const createdAt = evt.payload.created_at;
      if (
        typeof communityId !== "string" ||
        typeof channelId !== "string" ||
        typeof messageId !== "string"
      )
        return;

      const nexus = core.messages.for(communityId);

      const partial: MessageBundle = {
        id: messageId,
        channelId,
        authorUserId:
          typeof evt.payload.author_user_id === "string"
            ? evt.payload.author_user_id
            : null,
        content:
          typeof evt.payload.content === "string" ? evt.payload.content : "",
        metadata:
          typeof evt.payload.metadata === "object" && evt.payload.metadata !== null
            ? (evt.payload.metadata as Record<string, unknown>)
            : {},
        createdAt: normalizeCreatedAt(createdAt) ?? new Date().toISOString(),
        editedAt: null,
        deletedAt:
          typeof evt.payload.deleted_at === "string" &&
          evt.payload.deleted_at.trim()
            ? evt.payload.deleted_at
            : null,
        isHidden:
          typeof evt.payload.is_hidden === "boolean"
            ? evt.payload.is_hidden
            : false,
        displayName: "…",
        avatarSnapshotUrl: null,
        isPlatformStaff: false,
        replyToMessageId: null,
        reactions: [],
        attachment: null,
        linkPreview: null,
      } as MessageBundle;

      nexus.insertMessage(partial);

      const beforeCreatedAt = createdAtBeforeCursor(createdAt);

      void core.backends.communityData
        .listChannelMessages({
          communityId,
          channelId,
          limit: 1,
          ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
        })
        .then((result) => {
          const message = result.messages.find((m) => m.id === messageId);
          if (!message) return;
          nexus.updateMessage(messageId, message);
        })
        .catch((err) => {
          console.warn("[routeRealtimeEvent] MESSAGE_INSERT fetch failed", err);
        });
      return;
    }

    case "MESSAGE_UPDATE": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      const messageId = evt.payload.message_id;
      const createdAt = evt.payload.created_at;
      if (
        typeof communityId !== "string" ||
        typeof channelId !== "string" ||
        typeof messageId !== "string"
      )
        return;

      const nexus = core.messages.for(communityId);
      const beforeCreatedAt = createdAtBeforeCursor(createdAt);

      void core.backends.communityData
        .listChannelMessages({
          communityId,
          channelId,
          limit: 1,
          ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
        })
        .then((result) => {
          const message = result.messages.find((m) => m.id === messageId);
          if (!message) return;
          nexus.updateMessage(messageId, message);
        })
        .catch((err) => {
          console.warn("[routeRealtimeEvent] MESSAGE_UPDATE fetch failed", err);
        });
      return;
    }

    case "MESSAGE_DELETE": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      const messageId = evt.payload.message_id;
      if (
        typeof communityId !== "string" ||
        typeof channelId !== "string" ||
        typeof messageId !== "string"
      )
        return;

      core.messages.for(communityId).removeMessage(messageId, channelId);
      return;
    }

    case "ROLE_CHANGE": {
      const communityId = evt.payload.community_id;
      if (typeof communityId !== "string" || communityId.trim().length === 0)
        return;
      core.onRoleChange(communityId);
      return;
    }

    case "NOTIFICATION": {
      core.onNotificationEvent(evt.payload);
      return;
    }

    case "DM_CONVERSATION": {
      core.onDmConversationEvent(evt.payload);
      return;
    }

    case "DM_MESSAGE": {
      core.onDmMessageEvent(evt.payload);
      return;
    }

    case "SOCIAL_CHANGE": {
      core.onSocialChange(evt.payload);
      return;
    }

    case "CHANNEL_INSERT":
    case "CHANNEL_UPDATE": {
      const communityId = evt.payload.community_id;
      if (typeof communityId !== "string") return;
      const channelRaw = evt.payload.channel ?? evt.payload;
      if (!channelRaw || typeof channelRaw !== "object") return;
      const candidate = channelRaw as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.community_id !== "string"
      ) {
        // Fall back to a refetch when the payload doesn't carry a full row.
        void core.channels.loadForCommunity(communityId).catch((err) => {
          console.warn("[routeRealtimeEvent] channel reload failed", err);
        });
        return;
      }
      core.channels.upsertChannel(candidate as never);
      return;
    }

    case "CHANNEL_DELETE": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      if (typeof communityId !== "string" || typeof channelId !== "string") return;
      core.channels.removeChannel(channelId, communityId);
      core.messages.for(communityId).evictChannel(channelId);
      return;
    }

    case "member_channel_access_revoked": {
      const channelId =
        typeof evt.payload.channel_id === "string"
          ? evt.payload.channel_id
          : typeof evt.payload.channelId === "string"
            ? evt.payload.channelId
            : null;
      const communityId =
        typeof evt.payload.community_id === "string"
          ? evt.payload.community_id
          : typeof evt.payload.communityId === "string"
            ? evt.payload.communityId
            : null;
      const revokedUserId =
        typeof evt.payload.revoked_user_id === "string"
          ? evt.payload.revoked_user_id
          : typeof evt.payload.revokedUserId === "string"
            ? evt.payload.revokedUserId
            : null;
      if (!channelId || !communityId) return;

      core.channels.removeChannel(channelId, communityId);
      core.messages.for(communityId).evictChannel(channelId);

      if (revokedUserId) {
        notifyMemberChannelAccessRevoked({
          communityId,
          channelId,
          revokedUserId,
        });
      }
      return;
    }

    case "member_banned": {
      const communityId =
        typeof evt.payload.community_id === "string"
          ? evt.payload.community_id
          : typeof evt.payload.communityId === "string"
            ? evt.payload.communityId
            : null;
      const bannedUserId =
        typeof evt.payload.banned_user_id === "string"
          ? evt.payload.banned_user_id
          : typeof evt.payload.bannedUserId === "string"
            ? evt.payload.bannedUserId
            : null;
      if (!communityId || !bannedUserId) return;

      notifyMemberBanned({ communityId, bannedUserId });
      void core.ensureCommunityPermissions(communityId);
      return;
    }

    case "report_status_updated": {
      const reportPayload = evt.payload as ReportStatusUpdatedBroadcastPayload;
      core.moderation.handleReportChange(reportPayload);
      return;
    }

    case "USER_PLATFORM_BANNED": {
      const userId =
        typeof evt.payload.user_id === "string" ? evt.payload.user_id : null;
      if (userId) {
        core.moderation.handleUserPlatformBanned(userId);
      }
      return;
    }

    case "CHANNEL_GROUP_CHANGE": {
      const communityId = evt.payload.community_id;
      if (typeof communityId !== "string" || communityId.trim().length === 0)
        return;
      void core.channels.loadForCommunity(communityId).catch((err) => {
        console.warn("[routeRealtimeEvent] CHANNEL_GROUP_CHANGE reload failed", err);
      });
      return;
    }

    case "PROFILE_IDENTITY_CHANGE": {
      const event =
        typeof evt.payload.event === "string" ? evt.payload.event : null;
      const userId =
        typeof evt.payload.user_id === "string" ? evt.payload.user_id : null;
      if (!userId) return;

      if (event === "DELETE") {
        core.profiles.removeProfile(userId);
        return;
      }

      const username =
        typeof evt.payload.username === "string" ? evt.payload.username : null;
      const updatedAt =
        typeof evt.payload.updated_at === "string"
          ? evt.payload.updated_at
          : null;
      if (!username || !updatedAt) return;

      core.profiles.upsertProfile(
        mapLiveProfileIdentity({
          user_id: userId,
          username,
          avatar_url:
            typeof evt.payload.avatar_url === "string"
              ? evt.payload.avatar_url
              : null,
          updated_at: updatedAt,
        }),
      );
      return;
    }

    case "COMMUNITY_MEMBERSHIP_CHANGE": {
      const userId =
        typeof evt.payload.user_id === "string" ? evt.payload.user_id : null;
      if (!userId) return;
      void core.communities.load(userId).catch((err) => {
        console.warn(
          "[routeRealtimeEvent] COMMUNITY_MEMBERSHIP_CHANGE reload failed",
          err,
        );
      });
      return;
    }

    default: {
      if (typeof console?.debug === "function") {
        console.debug("[routeRealtimeEvent]", evt.type, evt.payload);
      }
    }
  }
}
