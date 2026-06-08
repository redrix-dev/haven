import React, { useCallback, useEffect, useRef, useState } from "react";
import { NotificationCenterModal } from "@web-client/components/notifications/NotificationCenterModal";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useChatAppModalUiState } from "@web-client/chat-app/modals/chatAppModalUiState";
import {
  bootstrapNotificationSoundSync,
  createNotificationSoundSyncState,
  resetNotificationSoundSyncState,
  syncNotificationSounds,
  useHavenCore,
} from "@shared/core";
import { useNotificationCounts, useNotifications } from "@react-bindings";
import { getErrorMessage } from "@platform/lib/errors";

export function NotificationModalsHost() {
  const app = useChatAppSession();
  const core = useHavenCore();
  const inbox = core.notifications;
  const notificationCounts = useNotificationCounts(inbox);
  const notificationItems = useNotifications(inbox);
  const { notificationsPanelOpen, setNotificationsPanelOpen } =
    useChatAppModalUiState();

  const [notificationsRefreshing, setNotificationsRefreshing] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const soundSyncRef = useRef(createNotificationSoundSyncState());
  const audioRef = useRef(app.appSettings.notifications);

  useEffect(() => {
    audioRef.current = app.appSettings.notifications;
  }, [app.appSettings.notifications]);

  useEffect(() => {
    if (!app.user?.id) {
      resetNotificationSoundSyncState(soundSyncRef.current);
      return;
    }
    void bootstrapNotificationSoundSync(core, soundSyncRef.current);
    void inbox.loadPreferences();
  }, [app.user?.id, core, inbox]);

  useEffect(() => {
    if (!app.user?.id || !soundSyncRef.current.bootstrapped) return;
    void syncNotificationSounds(core, audioRef.current, soundSyncRef.current).catch(
      (error) => {
        console.error("Failed to play notification sounds:", error);
      },
    );
  }, [app.user?.id, core, notificationItems.length]);

  useEffect(() => {
    if (!notificationsPanelOpen || !app.user?.id) return;
    if (notificationCounts.unseenCount <= 0) return;
    void inbox.markAllSeen().catch((error) => {
      console.error("Failed to mark notifications seen:", error);
    });
  }, [app.user?.id, inbox, notificationCounts.unseenCount, notificationsPanelOpen]);

  const refreshNotificationsManually = useCallback(async () => {
    setNotificationsRefreshing(true);
    setNotificationsError(null);
    try {
      await inbox.refreshInbox();
      await inbox.loadPreferences();
    } catch (error) {
      setNotificationsError(getErrorMessage(error, "Failed to refresh notifications."));
    } finally {
      setNotificationsRefreshing(false);
    }
  }, [inbox]);

  const withRefresh = useCallback(
    async (action: () => Promise<void>) => {
      setNotificationsError(null);
      try {
        await action();
      } catch (error) {
        setNotificationsError(getErrorMessage(error, "Failed to update notifications."));
      }
    },
    [],
  );

  if (!notificationsPanelOpen) return null;

  return (
    <NotificationCenterModal
      open={notificationsPanelOpen}
      onOpenChange={setNotificationsPanelOpen}
      counts={notificationCounts}
      error={notificationsError}
      refreshing={notificationsRefreshing}
      onRefresh={() => void refreshNotificationsManually()}
      onMarkAllSeen={() => void withRefresh(() => inbox.markAllSeen())}
      onDismissAll={() => void withRefresh(() => inbox.dismissAll())}
      onMarkNotificationRead={(recipientId) =>
        void withRefresh(() => inbox.markRead([recipientId]))
      }
      onDismissNotification={(recipientId) =>
        void withRefresh(() => inbox.dismiss([recipientId]))
      }
      onOpenNotificationItem={(notification) =>
        void app.openNotificationItem(notification)
      }
      onAcceptFriendRequestNotification={({
        recipientId,
        friendRequestId,
      }) => {
        void app.acceptFriendRequestFromNotification({
          recipientId,
          friendRequestId,
        });
      }}
      onDeclineFriendRequestNotification={({
        recipientId,
        friendRequestId,
      }) => {
        void app.declineFriendRequestFromNotification({
          recipientId,
          friendRequestId,
        });
      }}
      onDismissFriendRequestNotification={({
        recipientId,
        friendRequestId,
      }) => {
        void app.dismissFriendRequestNotification({
          recipientId,
          friendRequestId,
        });
      }}
      localAudioSettings={app.appSettings.notifications}
      localAudioSaving={app.notificationAudioSettingsSaving}
      localAudioError={app.notificationAudioSettingsError}
      onUpdateLocalAudioSettings={(next) =>
        void app.setNotificationAudioSettings(next)
      }
    />
  );
}
