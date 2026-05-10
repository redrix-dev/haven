import React, { useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { AccountSettingsModal } from "@shared/features/profile/components/AccountSettingsModal";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";
import { computeEffectiveShellTheme } from "@shared/themes/computeEffectiveShellTheme";
import { featureFlagsToEntitlementKeys } from "@shared/themes/themeEntitlements";
import { listSelectableBuiltinThemes } from "@shared/themes/selectableBuiltinThemes";

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

  const shellThemeOptions = useMemo(() => {
    const granted = new Set(featureFlagsToEntitlementKeys(app.featureFlags));
    return listSelectableBuiltinThemes(granted).map((t) => ({
      id: t.id,
      name: t.name,
    }));
  }, [app.featureFlags]);

  const effectiveShellThemeId = useMemo(
    () =>
      computeEffectiveShellTheme({
        profileThemeId: app.profileThemeId,
        featureFlags: app.featureFlags,
        featureFlagsLoaded: app.featureFlagsLoaded,
        userId: user.id,
      }).id,
    [
      app.profileThemeId,
      app.featureFlags,
      app.featureFlagsLoaded,
      user.id,
    ],
  );

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
      shellThemeOptions={shellThemeOptions}
      effectiveShellThemeId={effectiveShellThemeId}
      onSelectShellTheme={app.saveThemePreference}
    />
  );
}
