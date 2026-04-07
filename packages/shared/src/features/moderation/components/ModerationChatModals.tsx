import React from "react";
import type { User } from "@supabase/supabase-js";
import { ServerModmailPanel } from "@shared/features/moderation/components/ServerModmailPanel";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";

type ModerationChatModalsProps = {
  app: ChatAppOrchestrationApi;
  user: User;
  managedReportServers: Array<{ id: string; name: string }>;
  ui: Pick<
    ChatAppModalUiState,
    | "serverModmailOpen"
    | "setServerModmailOpen"
    | "serverPermissionsById"
  >;
};

export function ModerationChatModals({
  app,
  user,
  managedReportServers,
  ui: {
    serverModmailOpen,
    setServerModmailOpen,
    serverPermissionsById,
  },
}: ModerationChatModalsProps) {
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
