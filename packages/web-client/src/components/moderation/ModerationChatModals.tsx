import React from "react";
import type { User } from "@supabase/supabase-js";
import { ServerModmailPanel } from "@web-client/components/moderation/ServerModmailPanel";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";

type ModerationChatModalsProps = {
  user: User;
  managedReportServers: Array<{ id: string; name: string }>;
};

export function ModerationChatModals({
  user,
  managedReportServers,
}: ModerationChatModalsProps) {
  const app = useChatAppSession();
  const {
    serverModmailOpen,
    setServerModmailOpen,
    serverPermissionsById,
  } = useChatAppModalUiState();
  if (!app.serverModmailEnabled || !user) return null;

  return (
    <ServerModmailPanel
      open={serverModmailOpen}
      onOpenChange={setServerModmailOpen}
      currentUserDisplayName={app.userDisplayName}
      managedServers={managedReportServers}
      serverPermissionsById={serverPermissionsById}
      reportStatusRefreshVersion={app.reportStatusRefreshVersion}
      onBanUserFromServer={app.banUserFromServer}
      onKickUserFromServer={app.kickUserFromServer}
    />
  );
}
