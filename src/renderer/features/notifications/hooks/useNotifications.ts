import React from 'react';
import { playNotificationSound } from '@/lib/notifications/sound';
import type { NotificationBackend } from '@/lib/backend/notificationBackend';
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from '@/lib/backend/types';
import type { NotificationAudioSettings } from '@/shared/desktop/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { DEFAULT_NOTIFICATION_COUNTS } from '@/renderer/app/constants';

type UseNotificationsInput = {
  notificationBackend: Pick<
    NotificationBackend,
    | 'listNotifications'
    | 'getNotificationCounts'
    | 'markNotificationsRead'
    | 'markAllNotificationsSeen'
    | 'dismissNotifications'
    | 'getNotificationPreferences'
    | 'updateNotificationPreferences'
    | 'subscribeToNotificationInbox'
  >;
  userId: string | null | undefined;
  notificationsPanelOpen: boolean;
  audioSettings: NotificationAudioSettings;
};

export function useNotifications({
  notificationBackend,
  userId,
  notificationsPanelOpen,
  audioSettings,
}: UseNotificationsInput) {
  const [notificationItems, setNotificationItems] = React.useState<NotificationItem[]>([]);
  const [notificationCounts, setNotificationCounts] = React.useState<NotificationCounts>(
    DEFAULT_NOTIFICATION_COUNTS
  );
  const [notificationsLoading, setNotificationsLoading] = React.useState(false);
  const [notificationsRefreshing, setNotificationsRefreshing] = React.useState(false);
  const [notificationsError, setNotificationsError] = React.useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    React.useState<NotificationPreferences | null>(null);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = React.useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = React.useState(false);
  const [notificationPreferencesError, setNotificationPreferencesError] = React.useState<string | null>(
    null
  );

  const knownNotificationRecipientIdsRef = React.useRef<Set<string>>(new Set());
  const notificationsBootstrappedRef = React.useRef(false);
  const notificationAudioSettingsRef = React.useRef<NotificationAudioSettings>(audioSettings);

  React.useEffect(() => {
    notificationAudioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  const refreshNotificationInbox = React.useCallback(
    async (options?: { playSoundsForNew?: boolean }) => {
      if (!userId) return;

      const playSoundsForNew = Boolean(options?.playSoundsForNew);
      const [items, counts] = await Promise.all([
        notificationBackend.listNotifications({ limit: 50 }),
        notificationBackend.getNotificationCounts(),
      ]);

      const nextKnownIds = new Set(items.map((item) => item.recipientId));
      const previousKnownIds = knownNotificationRecipientIdsRef.current;
      const canPlaySounds = notificationsBootstrappedRef.current && playSoundsForNew;

      setNotificationItems(items);
      setNotificationCounts(counts);
      knownNotificationRecipientIdsRef.current = nextKnownIds;

      if (canPlaySounds) {
        for (const item of items) {
          if (previousKnownIds.has(item.recipientId)) continue;
          if (item.dismissedAt) continue;
          void playNotificationSound({
            kind: item.kind,
            deliverSound: item.deliverSound,
            audioSettings: notificationAudioSettingsRef.current,
          });
        }
      }

      notificationsBootstrappedRef.current = true;
    },
    [notificationBackend, userId]
  );

  const refreshNotificationPreferences = React.useCallback(async () => {
    if (!userId) return;
    const preferences = await notificationBackend.getNotificationPreferences();
    setNotificationPreferences(preferences);
  }, [notificationBackend, userId]);

  const resetNotifications = React.useCallback(() => {
    setNotificationItems([]);
    setNotificationCounts(DEFAULT_NOTIFICATION_COUNTS);
    setNotificationsLoading(false);
    setNotificationsRefreshing(false);
    setNotificationsError(null);
    setNotificationPreferences(null);
    setNotificationPreferencesLoading(false);
    setNotificationPreferencesSaving(false);
    setNotificationPreferencesError(null);
    knownNotificationRecipientIdsRef.current = new Set();
    notificationsBootstrappedRef.current = false;
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId) {
      resetNotifications();
      return () => {
        isMounted = false;
      };
    }

    setNotificationsLoading(true);
    setNotificationsError(null);
    notificationsBootstrappedRef.current = false;
    knownNotificationRecipientIdsRef.current = new Set();

    const loadInbox = async () => {
      try {
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load notification inbox:', error);
        setNotificationsError(getErrorMessage(error, 'Failed to load notifications.'));
      } finally {
        if (!isMounted) return;
        setNotificationsLoading(false);
      }
    };

    void loadInbox();

    return () => {
      isMounted = false;
    };
  }, [refreshNotificationInbox, resetNotifications, userId]);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setNotificationPreferences(null);
      setNotificationPreferencesLoading(false);
      setNotificationPreferencesSaving(false);
      setNotificationPreferencesError(null);
      return () => {
        isMounted = false;
      };
    }

    setNotificationPreferencesLoading(true);
    setNotificationPreferencesError(null);

    const loadPreferences = async () => {
      try {
        const preferences = await notificationBackend.getNotificationPreferences();
        if (!isMounted) return;
        setNotificationPreferences(preferences);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load notification preferences:', error);
        setNotificationPreferencesError(
          getErrorMessage(error, 'Failed to load notification preferences.')
        );
      } finally {
        if (!isMounted) return;
        setNotificationPreferencesLoading(false);
      }
    };

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [notificationBackend, userId]);

  React.useEffect(() => {
    if (!userId) return;

    const subscription = notificationBackend.subscribeToNotificationInbox(userId, () => {
      setNotificationsRefreshing(true);
      void refreshNotificationInbox({ playSoundsForNew: true })
        .catch((error) => {
          console.error('Failed to refresh notifications after realtime update:', error);
          setNotificationsError(getErrorMessage(error, 'Failed to refresh notifications.'));
        })
        .finally(() => {
          setNotificationsRefreshing(false);
        });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [notificationBackend, refreshNotificationInbox, userId]);

  React.useEffect(() => {
    if (!notificationsPanelOpen || !userId) return;
    if (notificationCounts.unseenCount <= 0) return;

    void notificationBackend
      .markAllNotificationsSeen()
      .then(() => refreshNotificationInbox({ playSoundsForNew: false }))
      .catch((error) => {
        console.error('Failed to mark notifications seen:', error);
      });
  }, [notificationBackend, notificationCounts.unseenCount, notificationsPanelOpen, refreshNotificationInbox, userId]);

  const saveNotificationPreferences = React.useCallback(
    async (values: NotificationPreferenceUpdate) => {
      setNotificationPreferencesSaving(true);
      setNotificationPreferencesError(null);
      try {
        const nextPreferences = await notificationBackend.updateNotificationPreferences(values);
        setNotificationPreferences(nextPreferences);
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        setNotificationPreferencesError(
          getErrorMessage(error, 'Failed to update notification preferences.')
        );
      } finally {
        setNotificationPreferencesSaving(false);
      }
    },
    [notificationBackend, refreshNotificationInbox]
  );

  const refreshNotificationsManually = React.useCallback(async () => {
    setNotificationsRefreshing(true);
    setNotificationsError(null);
    try {
      await refreshNotificationInbox({ playSoundsForNew: false });
      await refreshNotificationPreferences();
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to refresh notifications.'));
    } finally {
      setNotificationsRefreshing(false);
    }
  }, [refreshNotificationInbox, refreshNotificationPreferences]);

  const markAllNotificationsSeen = React.useCallback(async () => {
    try {
      await notificationBackend.markAllNotificationsSeen();
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to mark notifications seen.'));
    }
  }, [notificationBackend, refreshNotificationInbox]);

  const markNotificationRead = React.useCallback(
    async (recipientId: string) => {
      try {
        await notificationBackend.markNotificationsRead([recipientId]);
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to mark notification read.'));
      }
    },
    [notificationBackend, refreshNotificationInbox]
  );

  const dismissNotification = React.useCallback(
    async (recipientId: string) => {
      try {
        await notificationBackend.dismissNotifications([recipientId]);
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to dismiss notification.'));
      }
    },
    [notificationBackend, refreshNotificationInbox]
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
      resetNotifications,
      refreshNotificationInbox,
      refreshNotificationPreferences,
      saveNotificationPreferences,
      refreshNotificationsManually,
      markAllNotificationsSeen,
      markNotificationRead,
      dismissNotification,
      setNotificationsError,
    },
  };
}
