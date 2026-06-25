import type { RealtimeMutationTarget } from "./realtimeMutationTarget";
import { buildPartialMessageFromRealtimePayload } from "@shared/features/messaging/logic/realtimePartialMessage";
import { mapLiveProfileIdentity } from "@shared/lib/backend/controlPlaneBackend";
import type {
  MessageBundle,
  ReportStatusUpdatedBroadcastPayload,
} from "@shared/lib/backend/types";
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

export function routeRealtimeEvent(
  target: RealtimeMutationTarget,
  evt: RealtimeEvent,
): void {
  switch (evt.type) {
    case "MESSAGE_INSERT": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      const messageId = evt.payload.message_id;
      if (
        typeof communityId !== "string" ||
        typeof channelId !== "string" ||
        typeof messageId !== "string"
      )
        return;

      const nexus = target.messages.for(communityId);

      const partial = buildPartialMessageFromRealtimePayload({
        messageId,
        channelId,
        payload: evt.payload,
      });

      nexus.insertMessage(partial);

      void target.backends.communityData
        .getChannelMessage({
          communityId,
          channelId,
          messageId,
        })
        .then((message) => {
          if (!message) return;
          nexus.upsertMessage(message);
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
      if (
        typeof communityId !== "string" ||
        typeof channelId !== "string" ||
        typeof messageId !== "string"
      )
        return;

      const nexus = target.messages.for(communityId);

      void target.backends.communityData
        .getChannelMessage({
          communityId,
          channelId,
          messageId,
        })
        .then((message) => {
          if (!message) return;
          nexus.upsertMessage(message);
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

      target.messages.for(communityId).removeMessage(messageId, channelId);
      return;
    }

    case "ROLE_CHANGE": {
      const communityId = evt.payload.community_id;
      if (typeof communityId !== "string" || communityId.trim().length === 0)
        return;
      target.onRoleChange(communityId);
      return;
    }

    case "NOTIFICATION": {
      target.onNotificationEvent(evt.payload);
      return;
    }

    case "DM_CONVERSATION": {
      target.onDmConversationEvent(evt.payload);
      return;
    }

    case "DM_MESSAGE": {
      target.onDmMessageEvent(evt.payload);
      return;
    }

    case "SOCIAL_CHANGE": {
      target.onSocialChange(evt.payload);
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
        void target.channels.loadForCommunity(communityId).catch((err) => {
          console.warn("[routeRealtimeEvent] channel reload failed", err);
        });
        return;
      }
      target.channels.upsertChannel(candidate as never);
      return;
    }

    case "CHANNEL_DELETE": {
      const communityId = evt.payload.community_id;
      const channelId = evt.payload.channel_id;
      if (typeof communityId !== "string" || typeof channelId !== "string")
        return;
      target.channels.removeChannel(channelId, communityId);
      target.messages.for(communityId).evictChannel(channelId);
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

      target.channels.removeChannel(channelId, communityId);
      target.messages.for(communityId).evictChannel(channelId);

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
      void target.ensureCommunityPermissions(communityId);
      return;
    }

    case "report_status_updated": {
      const reportPayload = evt.payload as ReportStatusUpdatedBroadcastPayload;
      target.moderation.handleReportChange(reportPayload);
      return;
    }

    case "report_created": {
      // Payload is sent snake_case from SQL; tolerate either casing.
      const p = evt.payload as Record<string, unknown>;
      const communityId =
        typeof p.communityId === "string"
          ? p.communityId
          : typeof p.community_id === "string"
            ? p.community_id
            : null;
      const reportId =
        typeof p.reportId === "string"
          ? p.reportId
          : typeof p.report_id === "string"
            ? p.report_id
            : null;
      if (communityId && reportId) {
        target.moderation.handleReportCreated?.({ communityId, reportId });
      }
      return;
    }

    case "USER_PLATFORM_BANNED": {
      const userId =
        typeof evt.payload.user_id === "string" ? evt.payload.user_id : null;
      if (userId) {
        target.moderation.handleUserPlatformBanned(userId);
      }
      return;
    }

    case "CHANNEL_GROUP_CHANGE": {
      const communityId = evt.payload.community_id;
      if (typeof communityId !== "string" || communityId.trim().length === 0)
        return;
      void target.channels.loadForCommunity(communityId).catch((err) => {
        console.warn(
          "[routeRealtimeEvent] CHANNEL_GROUP_CHANGE reload failed",
          err,
        );
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
        target.profiles.removeProfile(userId);
        return;
      }

      const username =
        typeof evt.payload.username === "string" ? evt.payload.username : null;
      const updatedAt =
        typeof evt.payload.updated_at === "string"
          ? evt.payload.updated_at
          : null;
      if (!username || !updatedAt) return;

      target.profiles.upsertProfile(
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
      void target.communities.load(userId).catch((err) => {
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
