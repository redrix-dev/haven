import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from '@shared/lib/backend/types';
import { asRecord } from '@platform/lib/records';

export const BANNED_REPLY_PLACEHOLDER_CONTENT = '[content removed]';

type BanVisibilityBundle = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
};

const getReplyToMessageId = (message: Message): string | null => {
  const metadata = asRecord(message.metadata);
  if (!metadata) return null;
  const replyToMessageId = metadata.replyToMessageId;
  return typeof replyToMessageId === 'string' && replyToMessageId.trim().length > 0
    ? replyToMessageId
    : null;
};

const createRemovedReplyPlaceholder = (message: Message): Message => {
  const nextMetadata = {
    ...(asRecord(message.metadata) ?? {}),
    moderation: {
      contentRemoved: true,
      reason: 'ban',
    },
  } as Message['metadata'];

  return {
    ...message,
    author_user_id: null,
    content: BANNED_REPLY_PLACEHOLDER_CONTENT,
    metadata: nextMetadata,
  };
};

export const isBanRemovedReplyPlaceholder = (message: Message): boolean => {
  const metadata = asRecord(message.metadata);
  const moderation = asRecord(metadata?.moderation);
  return moderation?.contentRemoved === true && moderation?.reason === 'ban';
};

export const applyBanVisibilityToMessageBundle = (
  bundle: BanVisibilityBundle,
  bannedUserIds: string[]
): BanVisibilityBundle => {
  if (bannedUserIds.length === 0) {
    return bundle;
  }

  const bannedUserIdSet = new Set(bannedUserIds);
  const repliesByParentId = new Map<string, Message[]>();

  for (const message of bundle.messages) {
    const parentId = getReplyToMessageId(message);
    if (!parentId || parentId === message.id) continue;
    const existingReplies = repliesByParentId.get(parentId) ?? [];
    existingReplies.push(message);
    repliesByParentId.set(parentId, existingReplies);
  }

  const removedThreadMessageIds = new Set<string>();
  const pendingThreadRootIds: string[] = [];

  for (const message of bundle.messages) {
    if (!message.author_user_id || !bannedUserIdSet.has(message.author_user_id)) continue;
    const parentId = getReplyToMessageId(message);
    const isThreadOwner = !parentId || parentId === message.id;
    if (isThreadOwner) {
      // CHECKPOINT 5 COMPLETE
      pendingThreadRootIds.push(message.id);
    }
  }

  while (pendingThreadRootIds.length > 0) {
    const nextMessageId = pendingThreadRootIds.pop();
    if (!nextMessageId || removedThreadMessageIds.has(nextMessageId)) continue;
    removedThreadMessageIds.add(nextMessageId);
    for (const reply of repliesByParentId.get(nextMessageId) ?? []) {
      pendingThreadRootIds.push(reply.id);
    }
  }

  const placeholderMessageIds = new Set<string>();
  const moderatedMessages: Message[] = [];

  for (const message of bundle.messages) {
    if (removedThreadMessageIds.has(message.id)) continue;

    if (message.author_user_id && bannedUserIdSet.has(message.author_user_id)) {
      // CHECKPOINT 5 COMPLETE
      placeholderMessageIds.add(message.id);
      moderatedMessages.push(createRemovedReplyPlaceholder(message));
      continue;
    }

    moderatedMessages.push(message);
  }

  const visibleMessageIds = new Set(moderatedMessages.map((message) => message.id));
  const hiddenMessageIds = new Set<string>([...removedThreadMessageIds, ...placeholderMessageIds]);

  return {
    messages: moderatedMessages,
    reactions: bundle.reactions.filter(
      (reaction) =>
        !bannedUserIdSet.has(reaction.userId) &&
        visibleMessageIds.has(reaction.messageId) &&
        !hiddenMessageIds.has(reaction.messageId)
    ),
    attachments: bundle.attachments.filter(
      (attachment) =>
        !bannedUserIdSet.has(attachment.ownerUserId) &&
        visibleMessageIds.has(attachment.messageId) &&
        !hiddenMessageIds.has(attachment.messageId)
    ),
    linkPreviews: bundle.linkPreviews.filter(
      (preview) => visibleMessageIds.has(preview.messageId) && !hiddenMessageIds.has(preview.messageId)
    ),
  };
};
