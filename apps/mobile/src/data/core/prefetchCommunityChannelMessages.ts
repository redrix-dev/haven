import { requireHavenCore } from "./havenCoreRegistry";

export type PrefetchCommunityChannelMessagesInput = {
  serverId: string;
  channelId: string;
};

/** Prefetch a community text channel via the message nexus (idempotent). */
export async function prefetchCommunityChannelMessages({
  serverId,
  channelId,
}: PrefetchCommunityChannelMessagesInput): Promise<void> {
  try {
    const core = requireHavenCore();
    await core.messages.for(serverId).ensureInitialLoaded(channelId, {
      freshnessMs: 0,
    });
  } catch (err) {
    console.warn("[prefetchCommunityChannelMessages] prefetch failed", err);
  }
}
