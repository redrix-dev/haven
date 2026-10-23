import type { ViewerMessagePolicyState } from "@shared/core/viewerMessagePolicy";
import type { ChannelMeta } from "@shared/features/messaging/logic";
import type { MessageBundle } from "@shared/lib/backend/types";
import type { CommunityMessageState } from "./communityMessageNexus";
import {
  projectVisibleChannelMessages,
  projectVisibleChannelMessagesBlockOnly,
} from "./projectVisibleChannelMessages";

// Returned by selectors only, never written into a store, so sharing it is safe.
const EMPTY_MESSAGES: MessageBundle[] = [];

/**
 * A channel's messages, oldest first. Partial placeholder entries are left out.
 *
 * Pure: on Solid, call it inside a memo with the tracked store so the memo
 * subscribes to exactly the entries it reads; on mobile, use it as a zustand
 * selector.
 */
export function selectChannelMessages(
  state: CommunityMessageState,
  channelId: string,
): MessageBundle[] {
  const ids = state.byChannel[channelId];
  if (!ids?.length) return EMPTY_MESSAGES;
  const messages: MessageBundle[] = [];
  for (const id of ids) {
    const entry = state.entities[id];
    if (entry && !entry.partial) messages.push(entry.data);
  }
  return messages;
}

export function selectChannelMeta(
  state: CommunityMessageState,
  channelId: string,
): ChannelMeta {
  return {
    hasMore: state.hasMore[channelId] ?? false,
    cursor: state.cursors[channelId] ?? null,
  };
}

/**
 * What the viewer is allowed to see of a channel, given the policy the core
 * computed. With no policy for this community yet, only the block filter
 * applies.
 *
 * Pass the policy state as-is: on Solid that is the live proxy, so only the
 * fields read here become dependencies.
 */
export function projectChannelMessagesForViewer(
  messages: MessageBundle[],
  policy: ViewerMessagePolicyState,
  context: { communityId: string; channelId: string },
): MessageBundle[] {
  const communityPolicy = policy.communities[context.communityId];
  if (!communityPolicy) {
    return projectVisibleChannelMessagesBlockOnly(
      messages,
      policy.hiddenAuthorIds,
    );
  }
  return projectVisibleChannelMessages(
    messages,
    {
      hiddenAuthorIds: policy.hiddenAuthorIds,
      showHiddenMessages: policy.showHiddenMessages,
      communities: { [context.communityId]: communityPolicy },
    },
    context,
  );
}
