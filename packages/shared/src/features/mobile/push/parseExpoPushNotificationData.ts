import type { NotificationKind } from '@shared/lib/backend/types';

const KNOWN_KINDS = new Set<NotificationKind>([
  'friend_request_received',
  'friend_request_accepted',
  'dm_message',
  'channel_mention',
  'system',
]);

export type ParsedExpoPushPayload =
  | { kind: 'dm_message'; conversationId: string | null }
  | { kind: 'friend_request_received'; friendRequestId: string | null }
  | { kind: 'friend_request_accepted' }
  | { kind: 'channel_mention'; communityId: string | null; channelId: string | null }
  | { kind: 'system' };

function parseQueryString(search: string): Record<string, string> {
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  const out: Record<string, string> = {};
  for (const part of trimmed.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq >= 0 ? decodeURIComponent(part.slice(0, eq)) : decodeURIComponent(part);
    const val = eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : '';
    if (key) out[key] = val;
  }
  return out;
}

/** Parses `data.url` from expo-push-worker (`/?kind=...&conversationId=...`). */
export function parseExpoPushUrl(url: string): Partial<{
  kind: string;
  conversationId: string;
  friendRequestId: string;
  communityId: string;
  channelId: string;
}> {
  try {
    const qIndex = url.indexOf('?');
    const query = qIndex >= 0 ? url.slice(qIndex) : '';
    const params = parseQueryString(query);
    return {
      kind: params.kind,
      conversationId: params.conversationId,
      friendRequestId: params.friendRequestId,
      communityId: params.communityId,
      channelId: params.channelId,
    };
  } catch {
    return {};
  }
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Normalizes Expo push `data` from expo-push-worker (explicit fields + optional `url` fallback).
 */
export function parseExpoPushNotificationData(raw: unknown): ParsedExpoPushPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  let kindRaw = asTrimmedString(data.kind);
  let conversationId = asTrimmedString(data.conversationId);
  let friendRequestId = asTrimmedString(data.friendRequestId);
  let communityId = asTrimmedString(data.communityId);
  let channelId = asTrimmedString(data.channelId);

  const urlRaw = asTrimmedString(data.url);
  if (urlRaw) {
    const fromUrl = parseExpoPushUrl(urlRaw.startsWith('/') ? urlRaw : `/${urlRaw}`);
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
    case 'dm_message':
      return { kind: 'dm_message', conversationId };
    case 'friend_request_received':
      return { kind: 'friend_request_received', friendRequestId };
    case 'friend_request_accepted':
      return { kind: 'friend_request_accepted' };
    case 'channel_mention':
      return { kind: 'channel_mention', communityId, channelId };
    case 'system':
    default:
      return { kind: 'system' };
  }
}
