import { 
    asRecord,
    getRecordString } from '@/shared/lib/records';



const WEB_DEEP_LINK_DEDUPE_WINDOW_MS = 5000;

const safeStableStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return '[unserializable]';
  }
};

const normalizeDeepLinkPathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

type WebAppDeepLinkTarget =
  | { kind: 'invite'; inviteCode: string }
  | { kind: 'dm_message'; conversationId: string }
  | { kind: 'friend_request_received'; friendRequestId: string | null }
  | { kind: 'friend_request_accepted' }
  | { kind: 'channel_mention'; communityId: string; channelId: string };

  const getMergedUrlParams = (parsed: URL): URLSearchParams => {
  const merged = new URLSearchParams();

  const apply = (params: URLSearchParams) => {
    for (const [key, value] of params.entries()) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  };

  apply(parsed.searchParams);
  if (parsed.hash.startsWith('#')) {
    const rawHash = parsed.hash.slice(1);
    if (rawHash.startsWith('?')) {
      apply(new URLSearchParams(rawHash.slice(1)));
    }
  }

  return merged;
};

const parseNotificationTargetFromUrl = (parsed: URL): WebAppDeepLinkTarget | null => {
  const pathname = normalizeDeepLinkPathname(parsed.pathname);
  const params = getMergedUrlParams(parsed);

  if (pathname === '/auth/confirm') {
    return null;
  }

  if (pathname === '/invite') {
    const inviteCode = params.get('code')?.trim() ?? params.get('invite')?.trim() ?? '';
    return inviteCode ? { kind: 'invite', inviteCode } : null;
  }

  if (pathname.startsWith('/invite/')) {
    const inviteCode = pathname.slice('/invite/'.length).trim();
    return inviteCode ? { kind: 'invite', inviteCode } : null;
  }

  const target =
    params.get('target')?.trim().toLowerCase() ??
    params.get('open')?.trim().toLowerCase() ??
    null;
  const rawKind =
    params.get('kind')?.trim().toLowerCase() ??
    params.get('notificationKind')?.trim().toLowerCase() ??
    target;

  const conversationId = params.get('conversationId')?.trim() ?? null;
  const friendRequestId = params.get('friendRequestId')?.trim() ?? null;
  const communityId = params.get('communityId')?.trim() ?? null;
  const channelId = params.get('channelId')?.trim() ?? null;

  if (rawKind === 'dm' || rawKind === 'dm_message') {
    return conversationId ? { kind: 'dm_message', conversationId } : null;
  }

  if (
    rawKind === 'friend_requests' ||
    rawKind === 'friend_request_received' ||
    rawKind === 'requests'
  ) {
    return { kind: 'friend_request_received', friendRequestId };
  }

  if (rawKind === 'friends' || rawKind === 'friend_request_accepted') {
    return { kind: 'friend_request_accepted' };
  }

  if (
    rawKind === 'channel' ||
    rawKind === 'mention' ||
    rawKind === 'channel_mention'
  ) {
    return communityId && channelId
      ? { kind: 'channel_mention', communityId, channelId }
      : null;
  }

  return null;
};

const parseWebAppDeepLinkUrl = (url: string): WebAppDeepLinkTarget | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parseNotificationTargetFromUrl(parsed);
  } catch {
    return null;
  }
};

const parseWebPushClickPayloadTarget = (payload: unknown): WebAppDeepLinkTarget | null => {
  const root = asRecord(payload);
  if (!root) return null;

  const nestedPayload = asRecord(root.payload);
  const data = asRecord(root.data);
  const notification = asRecord(root.notification);
  const notificationData = asRecord(notification?.data);
  const records = [root, nestedPayload, data, notificationData];

  for (const record of records) {
    const candidateUrl = getRecordString(record, 'url') ?? getRecordString(record, 'path');
    if (candidateUrl) {
      const fromUrl = parseWebAppDeepLinkUrl(candidateUrl);
      if (fromUrl) return fromUrl;
    }
  }

  const kind =
    records
      .map((record) => getRecordString(record, 'kind') ?? getRecordString(record, 'notificationKind'))
      .find(Boolean)
      ?.toLowerCase() ?? null;

  const conversationId = records.map((record) => getRecordString(record, 'conversationId')).find(Boolean) ?? null;
  const friendRequestId = records.map((record) => getRecordString(record, 'friendRequestId')).find(Boolean) ?? null;
  const communityId = records.map((record) => getRecordString(record, 'communityId')).find(Boolean) ?? null;
  const channelId = records.map((record) => getRecordString(record, 'channelId')).find(Boolean) ?? null;

  switch (kind) {
    case 'dm_message':
      return conversationId ? { kind: 'dm_message', conversationId } : null;
    case 'friend_request_received':
      return { kind: 'friend_request_received', friendRequestId };
    case 'friend_request_accepted':
      return { kind: 'friend_request_accepted' };
    case 'channel_mention':
      return communityId && channelId ? { kind: 'channel_mention', communityId, channelId } : null;
    default:
      return null;
  }
};


export {
  WEB_DEEP_LINK_DEDUPE_WINDOW_MS,
  safeStableStringify,
  parseWebAppDeepLinkUrl,
  parseWebPushClickPayloadTarget,
  WebAppDeepLinkTarget,
  normalizeDeepLinkPathname,
  getMergedUrlParams,
}