import React from "react";
import type { User } from "@supabase/supabase-js";
import { FriendsModal } from "@web-client/components/social/FriendsModal";
import type { ChatAppOrchestrationApi } from "@web-client/hooks/useChatAppOrchestration";

type SocialChatModalsProps = {
  app: ChatAppOrchestrationApi;
  user: User;
};

export function SocialChatModals({ app, user }: SocialChatModalsProps) {
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
