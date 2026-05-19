import { BANNED_REPLY_PLACEHOLDER_CONTENT } from "@shared/features/messaging/lib/banVisibility";
import type { ViewerMessagePolicyState } from "@shared/core/viewerMessagePolicy";
import type { MessageBundle } from "@shared/lib/backend/types";

export type ProjectVisibleChannelMessagesContext = {
  communityId: string;
  channelId: string;
};

/** v1 block-only: hide messages whose author is in hiddenAuthorIds. */
export function projectVisibleChannelMessagesBlockOnly(
  raw: MessageBundle[],
  hiddenAuthorIds: ReadonlySet<string>,
): MessageBundle[] {
  if (raw.length === 0 || hiddenAuthorIds.size === 0) return raw;

  const repliesByParentId = new Map<string, MessageBundle[]>();
  for (const bundle of raw) {
    const parentId = bundle.replyToMessageId?.trim();
    if (!parentId || parentId === bundle.id) continue;
    const existing = repliesByParentId.get(parentId) ?? [];
    existing.push(bundle);
    repliesByParentId.set(parentId, existing);
  }

  const hiddenMessageIds = new Set<string>();
  const pendingHiddenRootIds: string[] = [];

  for (const bundle of raw) {
    if (
      !bundle.authorUserId ||
      !hiddenAuthorIds.has(bundle.authorUserId)
    ) {
      continue;
    }
    pendingHiddenRootIds.push(bundle.id);
  }

  while (pendingHiddenRootIds.length > 0) {
    const nextId = pendingHiddenRootIds.pop();
    if (!nextId || hiddenMessageIds.has(nextId)) continue;
    hiddenMessageIds.add(nextId);
    for (const reply of repliesByParentId.get(nextId) ?? []) {
      pendingHiddenRootIds.push(reply.id);
    }
  }

  if (hiddenMessageIds.size === 0) return raw;

  return raw
    .filter((bundle) => !hiddenMessageIds.has(bundle.id))
    .map((bundle) => ({
      ...bundle,
      reactions: bundle.reactions.filter(
        (reaction) =>
          !hiddenAuthorIds.has(reaction.userId) &&
          !hiddenMessageIds.has(reaction.messageId),
      ),
      attachment:
        bundle.attachment &&
        bundle.authorUserId &&
        hiddenAuthorIds.has(bundle.authorUserId)
          ? null
          : bundle.attachment,
      linkPreview: hiddenMessageIds.has(bundle.id) ? null : bundle.linkPreview,
    }));
}

/**
 * Full visibility projector: blocks, mod hidden toggle, revoked-author placeholders.
 */
export function projectVisibleChannelMessages(
  raw: MessageBundle[],
  policy: ViewerMessagePolicyState,
  ctx: ProjectVisibleChannelMessagesContext,
): MessageBundle[] {
  if (raw.length === 0) return raw;

  const communityPolicy = policy.communities[ctx.communityId];
  const revokedAuthorIds =
    communityPolicy?.revokedAuthorIdsByChannel[ctx.channelId] ?? [];

  let visible = raw;

  if (
    !communityPolicy?.suppressAuthorFilter &&
    policy.hiddenAuthorIds.size > 0
  ) {
    visible = projectVisibleChannelMessagesBlockOnly(
      visible,
      policy.hiddenAuthorIds,
    );
  }

  if (communityPolicy?.canViewBanHidden && !policy.showHiddenMessages) {
    visible = visible.filter((bundle) => !bundle.isHidden);
  }

  if (revokedAuthorIds.length > 0) {
    const revokedSet = new Set(revokedAuthorIds);
    visible = visible.map((bundle) => {
      if (!bundle.authorUserId || !revokedSet.has(bundle.authorUserId)) {
        return bundle;
      }
      return {
        ...bundle,
        authorUserId: null,
        content: BANNED_REPLY_PLACEHOLDER_CONTENT,
        metadata: {
          ...bundle.metadata,
          moderation: { contentRemoved: true, reason: "channel_access_revoked" },
        },
        reactions: [],
        attachment: null,
        linkPreview: null,
      };
    });
  }

  return visible;
}
