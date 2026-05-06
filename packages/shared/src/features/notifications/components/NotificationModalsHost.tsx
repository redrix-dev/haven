import React from "react";
import { NotificationCenterModal } from "@shared/features/notifications/components/NotificationCenterModal";
import type { ChatAppOrchestrationApi } from "@shared/app/hooks/useChatAppOrchestration";
import type { ChatAppModalUiState } from "@shared/app/chat-app/modals/useChatAppModalUiState";

type NotificationModalsHostProps = {
  app: ChatAppOrchestrationApi;
  ui: Pick<
    ChatAppModalUiState,
    "notificationsPanelOpen" | "setNotificationsPanelOpen"
  >;
};

export function NotificationModalsHost({
  app,
  ui: { notificationsPanelOpen, setNotificationsPanelOpen },
}: NotificationModalsHostProps) {
  if (!notificationsPanelOpen) return null;

  return (
    <NotificationCenterModal
      open={notificationsPanelOpen}
      onOpenChange={setNotificationsPanelOpen}
      counts={app.notificationCounts}
      error={app.notificationsError}
      refreshing={app.notificationsRefreshing}
      onRefresh={() => void app.refreshNotificationsManually()}
      onMarkAllSeen={() => void app.markAllNotificationsSeen()}
      onDismissAll={() => void app.dismissAllNotifications()}
      onMarkNotificationRead={(recipientId) =>
        void app.markNotificationRead(recipientId)
      }
      onDismissNotification={(recipientId) =>
        void app.dismissNotification(recipientId)
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
