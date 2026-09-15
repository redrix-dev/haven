import type { NotificationKind } from "@shared/lib/backend/types";
import { parseHavenLink } from "@shared/features/links";

const KNOWN_KINDS = new Set<NotificationKind>([
  "friend_request_received",
  "friend_request_accepted",
  "dm_message",
  "channel_mention",
  "system",
]);

export type ParsedExpoPushPayload =
  | { kind: "dm_message"; conversationId: string | null }
  | { kind: "friend_request_received"; friendRequestId: string | null }
  | { kind: "friend_request_accepted" }
  | {
      kind: "channel_mention";
      communityId: string | null;
      channelId: string | null;
    }
  | { kind: "system" };

type PushUrlFields = Partial<{
  kind: NotificationKind;
  conversationId: string;
  friendRequestId: string;
  communityId: string;
  channelId: string;
}>;

/**
 * Reads `data.url` from expo-push-worker (`/?kind=...&conversationId=...`)
 * through the shared link model. A DM or mention link missing its ids reads
 * as the notifications list there.
 */
function fieldsFromPushUrl(url: string): PushUrlFields {
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
  const intent = parseHavenLink(
    hasScheme || url.startsWith("/") ? url : `/${url}`,
  );
  switch (intent.kind) {
    case "dm":
      return { kind: "dm_message", conversationId: intent.conversationId };
    case "friends":
      return intent.tab === "requests"
        ? {
            kind: "friend_request_received",
            friendRequestId: intent.requestId ?? undefined,
          }
        : { kind: "friend_request_accepted" };
    case "channel":
      return {
        kind: "channel_mention",
        communityId: intent.communityId,
        channelId: intent.channelId,
      };
    case "notifications":
      return { kind: "system" };
    default:
      return {};
  }
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Normalizes Expo push `data` from expo-push-worker (explicit fields + optional `url` fallback).
 */
export function parseExpoPushNotificationData(
  raw: unknown,
): ParsedExpoPushPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  let kindRaw = asTrimmedString(data.kind);
  let conversationId = asTrimmedString(data.conversationId);
  let friendRequestId = asTrimmedString(data.friendRequestId);
  let communityId = asTrimmedString(data.communityId);
  let channelId = asTrimmedString(data.channelId);

  const urlRaw = asTrimmedString(data.url);
  if (urlRaw) {
    const fromUrl = fieldsFromPushUrl(urlRaw);
    kindRaw = kindRaw ?? fromUrl.kind ?? null;
    conversationId = conversationId ?? fromUrl.conversationId ?? null;
    friendRequestId = friendRequestId ?? fromUrl.friendRequestId ?? null;
    communityId = communityId ?? fromUrl.communityId ?? null;
    channelId = channelId ?? fromUrl.channelId ?? null;
  }

  if (!kindRaw || !KNOWN_KINDS.has(kindRaw as NotificationKind)) {
    return null;
  }

  const kind = kindRaw as NotificationKind;

  switch (kind) {
    case "dm_message":
      return { kind: "dm_message", conversationId };
    case "friend_request_received":
      return { kind: "friend_request_received", friendRequestId };
    case "friend_request_accepted":
      return { kind: "friend_request_accepted" };
    case "channel_mention":
      return { kind: "channel_mention", communityId, channelId };
    case "system":
    default:
      return { kind: "system" };
  }
}
