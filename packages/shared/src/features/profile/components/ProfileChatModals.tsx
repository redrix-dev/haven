import React from "react";
import type { User } from "@supabase/supabase-js";
import { AccountSettingsModal } from "@shared/features/profile/components/AccountSettingsModal";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";

type ProfileChatModalsProps = {
  app: ChatAppOrchestrationApi;
  user: User;
  ui: Pick<
    ChatAppModalUiState,
    | "showAccountModal"
    | "setShowAccountModal"
    | "setShowVoiceSettingsModal"
  >;
};

export function ProfileChatModals({ app, user, ui }: ProfileChatModalsProps) {
  const { showAccountModal, setShowAccountModal, setShowVoiceSettingsModal } =
    ui;

  if (!showAccountModal) return null;

  return (
    <AccountSettingsModal
      userEmail={user.email ?? "No email"}
      initialUsername={app.baseUserDisplayName}
      initialAvatarUrl={app.profileAvatarUrl}
      autoUpdateEnabled={app.appSettings.autoUpdateEnabled}
      updaterStatus={app.updaterStatus}
      updaterStatusLoading={app.updaterStatusLoading || app.appSettingsLoading}
      checkingForUpdates={app.checkingForUpdates}
      onClose={() => setShowAccountModal(false)}
      onSave={app.saveAccountSettings}
      onOpenVoiceSettings={() => setShowVoiceSettingsModal(true)}
      onAutoUpdateChange={app.setAutoUpdateEnabled}
      onCheckForUpdates={app.checkForUpdatesNow}
      onSignOut={app.signOut}
      onDeleteAccount={app.deleteAccount}
    />
  );
}
