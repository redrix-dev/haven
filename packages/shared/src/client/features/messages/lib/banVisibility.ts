import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from '@shared/lib/backend/types';
import { asRecord } from '@platform/lib/records';

export const BANNED_REPLY_PLACEHOLDER_CONTENT = '[content removed]';

type ModerationRemovalReason = 'ban' | 'channel_access_revoked';

type BanVisibilityBundle = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
};

type ChannelAccessVisibilityInput = {
  channelId: string;
  revokedUserIds: string[];
};

const getReplyToMessageId = (message: Message): string | null => {
  const metadata = asRecord(message.metadata);
  if (!metadata) return null;
  const replyToMessageId = metadata.replyToMessageId;
  return typeof replyToMessageId === 'string' && replyToMessageId.trim().length > 0
    ? replyToMessageId
    : null;
};

const createRemovedReplyPlaceholder = (
  message: Message,
  reason: ModerationRemovalReason
): Message => {
  const nextMetadata = {
    ...(asRecord(message.metadata) ?? {}),
    moderation: {
      contentRemoved: true,
      reason,
    },
  } as Message['metadata'];

  return {
    ...message,
    author_user_id: null,
    content: BANNED_REPLY_PLACEHOLDER_CONTENT,
    metadata: nextMetadata,
  };
};

export const isModerationRemovedReplyPlaceholder = (message: Message): boolean => {
  const metadata = asRecord(message.metadata);
  const moderation = asRecord(metadata?.moderation);
  const reason = moderation?.reason;
  return (
    moderation?.contentRemoved === true &&
    (reason === 'ban' || reason === 'channel_access_revoked')
  );
};

export const isBanRemovedReplyPlaceholder = (message: Message): boolean => {
  const metadata = asRecord(message.metadata);
  const moderation = asRecord(metadata?.moderation);
  return moderation?.contentRemoved === true && moderation?.reason === 'ban';
};

const applyRemovedAuthorVisibilityToMessageBundle = (
  bundle: BanVisibilityBundle,
  removedAuthorUserIds: string[],
  options: {
    reason: ModerationRemovalReason;
    channelId?: string;
  }
): BanVisibilityBundle => {
  if (removedAuthorUserIds.length === 0) {
    return bundle;
  }

  const removedAuthorUserIdSet = new Set(removedAuthorUserIds);
  const isTargetChannelMessage = (message: Message): boolean =>
    !options.channelId || message.channel_id === options.channelId;
  const repliesByParentId = new Map<string, Message[]>();

  for (const message of bundle.messages) {
    if (!isTargetChannelMessage(message)) continue;
    const parentId = getReplyToMessageId(message);
    if (!parentId || parentId === message.id) continue;
    const existingReplies = repliesByParentId.get(parentId) ?? [];
    existingReplies.push(message);
    repliesByParentId.set(parentId, existingReplies);
  }

  const removedThreadMessageIds = new Set<string>();
  const pendingThreadRootIds: string[] = [];

  for (const message of bundle.messages) {
    if (!isTargetChannelMessage(message)) continue;
    if (!message.author_user_id || !removedAuthorUserIdSet.has(message.author_user_id)) continue;
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

    if (
      isTargetChannelMessage(message) &&
      message.author_user_id &&
      removedAuthorUserIdSet.has(message.author_user_id)
    ) {
      // CHECKPOINT 5 COMPLETE
      placeholderMessageIds.add(message.id);
      moderatedMessages.push(createRemovedReplyPlaceholder(message, options.reason));
      continue;
    }

    moderatedMessages.push(message);
  }

  const visibleMessageIds = new Set(moderatedMessages.map((message) => message.id));
  const hiddenMessageIds = new Set<string>([...removedThreadMessageIds, ...placeholderMessageIds]);
  const targetMessageIds = new Set(
    bundle.messages.filter((message) => isTargetChannelMessage(message)).map((message) => message.id)
  );

  return {
    messages: moderatedMessages,
    reactions: bundle.reactions.filter(
      (reaction) =>
        (!targetMessageIds.has(reaction.messageId) || !removedAuthorUserIdSet.has(reaction.userId)) &&
        visibleMessageIds.has(reaction.messageId) &&
        !hiddenMessageIds.has(reaction.messageId)
    ),
    attachments: bundle.attachments.filter(
      (attachment) =>
        (attachment.channelId !== options.channelId ||
          !removedAuthorUserIdSet.has(attachment.ownerUserId)) &&
        visibleMessageIds.has(attachment.messageId) &&
        !hiddenMessageIds.has(attachment.messageId)
    ),
    linkPreviews: bundle.linkPreviews.filter(
      (preview) => visibleMessageIds.has(preview.messageId) && !hiddenMessageIds.has(preview.messageId)
    ),
  };
};

export const applyBanVisibilityToMessageBundle = (
  bundle: BanVisibilityBundle,
  bannedUserIds: string[]
): BanVisibilityBundle =>
  applyRemovedAuthorVisibilityToMessageBundle(bundle, bannedUserIds, {
    reason: 'ban',
  });

export const applyChannelAccessVisibilityToMessageBundle = (
  bundle: BanVisibilityBundle,
  input: ChannelAccessVisibilityInput
): BanVisibilityBundle => {
  if (!input.channelId) return bundle;
  return applyRemovedAuthorVisibilityToMessageBundle(bundle, input.revokedUserIds, {
    reason: 'channel_access_revoked',
    channelId: input.channelId,
  });
};

export const filterBlockedUserContent = (
  bundle: BanVisibilityBundle,
  blockedUserIds: ReadonlySet<string>,
  isElevated: boolean
): BanVisibilityBundle => {
  if (isElevated || blockedUserIds.size === 0) {
    return bundle;
  }

  const repliesByParentId = new Map<string, Message[]>();
  for (const message of bundle.messages) {
    const parentId = getReplyToMessageId(message);
    if (!parentId || parentId === message.id) continue;
    const existingReplies = repliesByParentId.get(parentId) ?? [];
    existingReplies.push(message);
    repliesByParentId.set(parentId, existingReplies);
  }

  const hiddenMessageIds = new Set<string>();
  const pendingHiddenRootIds: string[] = [];

  for (const message of bundle.messages) {
    if (!message.author_user_id || !blockedUserIds.has(message.author_user_id)) continue;
    pendingHiddenRootIds.push(message.id);
  }

  while (pendingHiddenRootIds.length > 0) {
    const nextMessageId = pendingHiddenRootIds.pop();
    if (!nextMessageId || hiddenMessageIds.has(nextMessageId)) continue;
    hiddenMessageIds.add(nextMessageId);
    for (const reply of repliesByParentId.get(nextMessageId) ?? []) {
      pendingHiddenRootIds.push(reply.id);
    }
  }

  const visibleMessages = bundle.messages.filter((message) => !hiddenMessageIds.has(message.id));
  const visibleMessageIds = new Set(visibleMessages.map((message) => message.id));

  return {
    messages: visibleMessages,
    reactions: bundle.reactions.filter(
      (reaction) =>
        !blockedUserIds.has(reaction.userId) && visibleMessageIds.has(reaction.messageId)
    ),
    attachments: bundle.attachments.filter(
      (attachment) =>
        !blockedUserIds.has(attachment.ownerUserId) && visibleMessageIds.has(attachment.messageId)
    ),
    linkPreviews: bundle.linkPreviews.filter((preview) =>
      visibleMessageIds.has(preview.messageId)
    ),
  }; // CHECKPOINT 5 COMPLETE
};
