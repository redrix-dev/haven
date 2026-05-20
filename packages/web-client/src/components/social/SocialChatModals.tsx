import React from "react";
import type { User } from "@supabase/supabase-js";
import { FriendsModal } from "@web-client/components/social/FriendsModal";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";

type SocialChatModalsProps = {
  user: User;
};

export function SocialChatModals({ user }: SocialChatModalsProps) {
  const app = useChatAppSession();
  return (
    <FriendsModal
      open={app.friendsPanelOpen}
      onOpenChange={(open) => {
        app.setFriendsPanelOpen(open);
        if (!open) app.setFriendsPanelHighlightedRequestId(null);
      }}
      currentUserId={user.id}
      currentUserDisplayName={app.userDisplayName}
      onStartDirectMessage={app.directMessageUser}
      requestedTab={app.friendsPanelRequestedTab}
      highlightedRequestId={app.friendsPanelHighlightedRequestId}
    />
  );
}
