import React from 'react';
import { useHavenCore } from '@shared/core';
import { playNotificationSound } from '@shared/features/notifications/utils/sound';
import { recordLocalNotificationDeliveryTrace } from '@shared/features/notifications/utils/devTrace';
import type {
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from '@shared/lib/backend/types';
import type { NotificationAudioSettings } from '@shared/types/settings';
import { useUiStore } from '@shared/stores/uiStore';
import { getErrorMessage } from '@platform/lib/errors';

type UseNotificationsInput = {
  userId: string | null | undefined;
  audioSettings: NotificationAudioSettings;
  autoMarkSeenOnPanelOpen?: boolean;
};

export function useNotifications({
  userId,
  audioSettings,
  autoMarkSeenOnPanelOpen = false,
}: UseNotificationsInput) {
  const core = useHavenCore();
  const inbox = core.notifications;

  const notificationItems = inbox.useNotifications();
  const notificationCounts = inbox.useCounts();
  const notificationsLoading = inbox.useIsLoading();
  const notificationsPanelOpen = useUiStore((state) => state.notificationsPanelOpen);

  const [notificationsRefreshing, setNotificationsRefreshing] = React.useState(false);
  const [notificationsError, setNotificationsError] = React.useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    React.useState<NotificationPreferences | null>(null);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] =
    React.useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] =
    React.useState(false);
  const [notificationPreferencesError, setNotificationPreferencesError] = React.useState<
    string | null
  >(null);

  const knownSoundIdsRef = React.useRef<Set<string>>(new Set());
  const bootstrappedRef = React.useRef(false);
  const audioRef = React.useRef(audioSettings);

  React.useEffect(() => {
    audioRef.current = audioSettings;
  }, [audioSettings]);

  const refreshNotificationInbox = React.useCallback(async (_options?: { playSoundsForNew?: boolean }) => {
    if (!userId) return;
    await inbox.loadInbox();
    await inbox.refreshCounts();
  }, [inbox, userId]);

  const playNewSounds = React.useCallback(async () => {
    if (!userId || !bootstrappedRef.current) return;
    const soundItems = await core.backends.notifications.listSoundNotifications({ limit: 50 });
    const previous = knownSoundIdsRef.current;
    const next = new Set(soundItems.map((item) => item.recipientId));
    knownSoundIdsRef.current = next;
    for (const item of soundItems) {
      if (previous.has(item.recipientId) || item.dismissedAt) continue;
      const result = await playNotificationSound({
        kind: item.kind,
        deliverSound: item.deliverSound,
        audioSettings: audioRef.current,
        suppressWhenUnfocused: false,
      });
      recordLocalNotificationDeliveryTrace({
        notificationRecipientId: item.recipientId,
        eventId: item.eventId,
        transport: 'in_app',
        stage: 'client_route',
        decision: result.played ? 'send' : 'skip',
        reasonCode: result.reasonCode,
        details: { kind: item.kind, allowInAppSound: result.played },
      });
    }
  }, [core.backends.notifications, userId]);

  React.useEffect(() => {
    if (!userId) {
      bootstrappedRef.current = false;
      knownSoundIdsRef.current = new Set();
      setNotificationPreferences(null);
      return;
    }
    if (!bootstrappedRef.current && notificationItems.length >= 0) {
      bootstrappedRef.current = true;
      void core.backends.notifications
        .listSoundNotifications({ limit: 50 })
        .then((items) => {
          knownSoundIdsRef.current = new Set(items.map((item) => item.recipientId));
        })
        .catch(() => {});
    }
  }, [core.backends.notifications, notificationItems.length, userId]);

  React.useEffect(() => {
    if (!userId || !bootstrappedRef.current) return;
    void playNewSounds().catch((error) => {
      console.error('Failed to play notification sounds:', error);
    });
  }, [notificationItems, playNewSounds, userId]);

  React.useEffect(() => {
    if (!userId) return;
    setNotificationPreferencesLoading(true);
    setNotificationPreferencesError(null);
    void core.backends.notifications
      .getNotificationPreferences()
      .then(setNotificationPreferences)
      .catch((error) => {
        setNotificationPreferencesError(
          getErrorMessage(error, 'Failed to load notification preferences.'),
        );
      })
      .finally(() => setNotificationPreferencesLoading(false));
  }, [core.backends.notifications, userId]);

  React.useEffect(() => {
    if (!autoMarkSeenOnPanelOpen || !notificationsPanelOpen || !userId) return;
    if (notificationCounts.unseenCount <= 0) return;
    void core.backends.notifications
      .markAllNotificationsSeen()
      .then(() => refreshNotificationInbox())
      .catch((error) => {
        console.error('Failed to mark notifications seen:', error);
      });
  }, [
    autoMarkSeenOnPanelOpen,
    core.backends.notifications,
    notificationCounts.unseenCount,
    notificationsPanelOpen,
    refreshNotificationInbox,
    userId,
  ]);

  const withRefresh = React.useCallback(
    async (action: () => Promise<void>) => {
      setNotificationsError(null);
      try {
        await action();
        await refreshNotificationInbox();
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to update notifications.'));
      }
    },
    [refreshNotificationInbox],
  );

  return {
    state: {
      notificationItems,
      notificationCounts,
      notificationsLoading,
      notificationsRefreshing,
      notificationsError,
      notificationPreferences,
      notificationPreferencesLoading,
      notificationPreferencesSaving,
      notificationPreferencesError,
    },
    derived: {},
    actions: {
      resetNotifications: () => {
        setNotificationsRefreshing(false);
        setNotificationsError(null);
        setNotificationPreferences(null);
        setNotificationPreferencesLoading(false);
        setNotificationPreferencesSaving(false);
        setNotificationPreferencesError(null);
        bootstrappedRef.current = false;
        knownSoundIdsRef.current = new Set();
      },
      refreshNotificationInbox,
      refreshNotificationPreferences: async () => {
        if (!userId) return;
        const preferences = await core.backends.notifications.getNotificationPreferences();
        setNotificationPreferences(preferences);
      },
      saveNotificationPreferences: async (values: NotificationPreferenceUpdate) => {
        setNotificationPreferencesSaving(true);
        setNotificationPreferencesError(null);
        try {
          const next = await core.backends.notifications.updateNotificationPreferences(values);
          setNotificationPreferences(next);
          await refreshNotificationInbox();
        } catch (error) {
          setNotificationPreferencesError(
            getErrorMessage(error, 'Failed to update notification preferences.'),
          );
        } finally {
          setNotificationPreferencesSaving(false);
        }
      },
      refreshNotificationsManually: async () => {
        setNotificationsRefreshing(true);
        setNotificationsError(null);
        try {
          await refreshNotificationInbox();
          const preferences = await core.backends.notifications.getNotificationPreferences();
          setNotificationPreferences(preferences);
        } catch (error) {
          setNotificationsError(getErrorMessage(error, 'Failed to refresh notifications.'));
        } finally {
          setNotificationsRefreshing(false);
        }
      },
      markAllNotificationsSeen: () =>
        withRefresh(() => core.backends.notifications.markAllNotificationsSeen().then(() => {})),
      markNotificationRead: (recipientId: string) =>
        withRefresh(() =>
          core.backends.notifications.markNotificationsRead([recipientId]).then(() => {}),
        ),
      dismissNotification: (recipientId: string) =>
        withRefresh(() =>
          core.backends.notifications.dismissNotifications([recipientId]).then(() => {}),
        ),
      dismissAllNotifications: () =>
        withRefresh(async () => {
          const recipientIds = notificationItems.map((item) => item.recipientId);
          if (recipientIds.length === 0) return;
          await core.backends.notifications.dismissNotifications(recipientIds);
        }),
      setNotificationsError,
    },
  };
}
