import type { MessageBundle } from "@shared/lib/backend/types";
import {
  isAuthorProfileTombstone,
  type MessageListAuthorProfile,
} from "@shared/features/profile/utils/profileTombstone";
import {
  getLiveProfile,
  resolveLiveAvatarUrl,
  resolveLiveUsername,
  type LiveProfilesRecord,
} from "@shared/infrastructure/liveProfiles";
import {
  dayBucket,
  formatDateDividerLabel,
  formatTime,
  GROUP_WINDOW_MS,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";

function authorProfileFromBundle(
  bundle: MessageBundle,
  liveProfiles: LiveProfilesRecord,
): MessageListAuthorProfile | undefined {
  if (!bundle.authorUserId) return undefined;
  const live = getLiveProfile(liveProfiles, bundle.authorUserId);
  return {
    username: live?.username ?? bundle.displayName,
    isPlatformStaff: bundle.isPlatformStaff,
    displayPrefix: null,
    avatarUrl: live?.avatarUrl ?? bundle.avatarSnapshotUrl,
  };
}

export function buildMessageBundleById(
  storedMessages: MessageBundle[],
): Map<string, MessageBundle> {
  return new Map(storedMessages.map((m) => [m.id, m] as const));
}

export function getReplyTargetLabel(
  replyToId: string | null,
  messageById: Map<string, MessageBundle>,
  liveProfiles: LiveProfilesRecord,
): string | null {
  if (!replyToId) return null;
  const parent = messageById.get(replyToId);
  if (!parent) return "a message";
  if (!parent.authorUserId) {
    const label = parent.displayName?.trim();
    return label && label.length > 0 ? label : "a message";
  }
  return (
    resolveLiveUsername(liveProfiles, parent.authorUserId, parent.displayName) ??
    parent.displayName ??
    parent.authorUserId.slice(0, 12)
  );
}

export function mapBundlesToChatMessages(
  storedMessages: MessageBundle[],
  liveProfiles: LiveProfilesRecord,
): ChatMessage[] {
  const messageById = buildMessageBundleById(storedMessages);
  return [...storedMessages].reverse().map((bundle) => {
    const cachedProfile = authorProfileFromBundle(bundle, liveProfiles);
    const preserveTombstone = isAuthorProfileTombstone(cachedProfile);
    const liveAvatar =
      bundle.authorUserId != null && !preserveTombstone
        ? resolveLiveAvatarUrl(liveProfiles, bundle.authorUserId, cachedProfile?.avatarUrl ?? null)
        : (cachedProfile?.avatarUrl ?? null);
    const authorName =
      bundle.authorUserId == null
        ? bundle.displayName
        : (resolveLiveUsername(liveProfiles, bundle.authorUserId, bundle.displayName) ??
          bundle.displayName);

    return {
      id: bundle.id,
      text: bundle.content,
      createdAt: bundle.createdAt,
      authorUserId: bundle.authorUserId ?? null,
      authorName,
      authorInitial: authorName.trim().charAt(0).toUpperCase() || "U",
      authorAvatarUrl: liveAvatar,
      isAuthorStaff: Boolean(bundle.authorUserId && bundle.isPlatformStaff),
      timestampLabel: formatTime(bundle.createdAt),
      replyTargetLabel: getReplyTargetLabel(bundle.replyToMessageId, messageById, liveProfiles),
      attachments: bundle.attachment ? [bundle.attachment] : [],
      linkPreview: bundle.linkPreview,
    };
  });
}

export function buildChatListItemsFromChatMessages(messages: ChatMessage[]): ChatListItem[] {
  const items: ChatListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const prev = messages[i + 1];
    const currentBucket = dayBucket(message.createdAt);
    const prevBucket = dayBucket(prev?.createdAt);
    const shouldInsertDivider = currentBucket !== prevBucket;
    const isSameDayAsPrev = Boolean(currentBucket) && currentBucket === prevBucket;
    const isSameAuthor = Boolean(message.authorUserId) && message.authorUserId === prev?.authorUserId;
    const currentTs = message.createdAt ? Date.parse(message.createdAt) : NaN;
    const prevTs = prev?.createdAt ? Date.parse(prev.createdAt) : NaN;
    const hasValidTs = Number.isFinite(currentTs) && Number.isFinite(prevTs);
    const isCloseInTime = hasValidTs ? Math.abs(currentTs - prevTs) <= GROUP_WINDOW_MS : false;

    items.push({
      kind: "message",
      message,
      isCondensed: isSameAuthor && isCloseInTime && isSameDayAsPrev,
    });

    if (shouldInsertDivider) {
      items.push({
        kind: "divider",
        id: `divider-${message.id}`,
        label: formatDateDividerLabel(message.createdAt ?? new Date().toISOString()),
      });
    }
  }
  return items;
}
