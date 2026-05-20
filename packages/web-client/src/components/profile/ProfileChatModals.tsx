import React, { useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { AccountSettingsModal } from "@web-client/components/profile/AccountSettingsModal";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";
import { computeEffectiveShellTheme } from "@shared/themes/computeEffectiveShellTheme";
import { featureFlagsToEntitlementKeys } from "@shared/themes/themeEntitlements";
import { listSelectableBuiltinThemes } from "@shared/themes/selectableBuiltinThemes";

type ProfileChatModalsProps = {
  user: User;
};

export function ProfileChatModals({ user }: ProfileChatModalsProps) {
  const app = useChatAppSession();
  const { showAccountModal, setShowAccountModal, setShowVoiceSettingsModal } =
    useChatAppModalUiState();

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
