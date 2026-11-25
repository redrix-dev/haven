import { useLayoutEffect } from "react";
import { perfTrace } from "@shared/debug/perfTrace";
import { ChannelChat } from "@/features/community/ChannelChat";

type CommunityChatScreenProps = {
  communityId: string;
  channelId: string;
  drawerGestureNonce?: number;
};

/** A community's open text channel. The shell has opened it. */
export function CommunityChatScreen({
  communityId,
  channelId,
  drawerGestureNonce = 0,
}: CommunityChatScreenProps) {
  useLayoutEffect(() => {
    // The cold-start paint; later channel switches have their own spans.
    if (perfTrace.markOnce("chat-first-commit", { communityId, channelId })) {
      perfTrace.flushSummary("chat-first-commit");
    }
    // First layout of this screen only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChannelChat
      channelId={channelId}
      communityId={communityId}
      drawerGestureNonce={drawerGestureNonce}
    />
  );
}
