import type { HavenReactCore } from "../HavenReactCore";

export type ModerationEventInput = {
  communityId: string;
  channelId?: string | null;
  messageId?: string | null;
};

/** Cross-nexus command for moderation actions that delete or hide messages. */
export function applyModerationEvent(
  core: HavenReactCore,
  input: ModerationEventInput,
): void {
  const { communityId, channelId, messageId } = input;
  if (!channelId || !messageId) return;
  core.messages.for(communityId).removeMessage(messageId, channelId);
}
