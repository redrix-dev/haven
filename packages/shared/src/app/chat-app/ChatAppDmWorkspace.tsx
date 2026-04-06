import React from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { DirectMessageArea } from "@shared/features/direct-messages/components/DirectMessageArea";
import { DirectMessagesSidebar } from "@shared/features/direct-messages/components/DirectMessagesSidebar";
import { getErrorMessage } from "@platform/lib/errors";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import { useSocialStore } from "@shared/stores";

type ChatAppDmWorkspaceProps = {
  app: ChatAppOrchestrationApi;
  user: User;
};

export function ChatAppDmWorkspace({ app, user }: ChatAppDmWorkspaceProps) {
  const blockedUserIds = useSocialStore((state) => state.blockedUserIds);
  const isSelectedDmConversationBlocked = Boolean(
    app.selectedDmConversation?.otherUserId &&
      blockedUserIds.has(app.selectedDmConversation.otherUserId),
  );
  return (
    <>
      <DirectMessagesSidebar
        currentUserDisplayName={app.userDisplayName}
        refreshing={app.dmConversationsRefreshing}
        error={app.dmConversationsError}
        onSelectConversation={(conversationId) => {
          void app
            .openDirectMessageConversation(conversationId)
            .catch((error: unknown) => {
              toast.error(
                getErrorMessage(error, "Failed to open direct message."),
              );
            });
        }}
        onRefresh={() => {
          void app.refreshDmConversations({ suppressLoadingState: true });
        }}
      />
      <DirectMessageArea
        currentUserId={user.id}
        currentUserDisplayName={app.userDisplayName}
        messages={app.dmMessages}
        loading={app.dmMessagesLoading}
        sending={app.dmMessageSendPending}
        refreshing={app.dmMessagesRefreshing}
        error={app.dmMessagesError}
        messagingUnavailable={isSelectedDmConversationBlocked}
        onRefresh={() => {
          if (!app.selectedDmConversationId) return;
          void app.refreshDmMessages(app.selectedDmConversationId, {
            suppressLoadingState: true,
            markRead: true,
          });
        }}
        onSendMessage={app.sendDirectMessage}
        onToggleMute={app.toggleSelectedDmConversationMuted}
        onBlockUser={app.blockDirectMessageUser}
        onReportMessage={app.reportDirectMessage}
      />
    </>
  );
}
