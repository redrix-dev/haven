import type { HavenCore } from "../HavenCore";

export type ModerationEventInput = {
  communityId: string;
  channelId?: string | null;
  messageId?: string | null;
};

/**
 * Cross-nexus command for moderation actions that delete or hide messages.
 * Routed via HavenCore so feature code never directly mutates nexuses.
 */
export function applyModerationEvent(
  core: HavenCore,
  input: ModerationEventInput,
): void {
  const { communityId, channelId, messageId } = input;
  if (!channelId || !messageId) return;
  core.messages.for(communityId).removeMessage(messageId, channelId);
}
