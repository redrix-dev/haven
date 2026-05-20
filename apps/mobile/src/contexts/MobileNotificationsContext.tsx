import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bootstrapNotificationSoundSync,
  createNotificationSoundSyncState,
  resetNotificationSoundSyncState,
  syncNotificationSounds,
  useHavenCore,
} from "@shared/core";
import type {
  NotificationPreferenceUpdate,
  NotificationPreferences,
} from "@shared/lib/backend/types";
import type { NotificationAudioSettings } from "@shared/types/settings";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

export type MobileNotificationsSession = {
  state: {
    notificationItems: ReturnType<
      ReturnType<typeof useHavenCore>["notifications"]["useNotifications"]
    >;
    notificationCounts: ReturnType<
      ReturnType<typeof useHavenCore>["notifications"]["useCounts"]
    >;
    notificationsLoading: boolean;
    notificationsRefreshing: boolean;
    notificationsError: string | null;
    notificationPreferences: NotificationPreferences | null;
    notificationPreferencesLoading: boolean;
    notificationPreferencesSaving: boolean;
    notificationPreferencesError: string | null;
  };
  derived: Record<string, never>;
  actions: {
    resetNotifications: () => void;
    refreshNotificationInbox: () => Promise<void>;
    refreshNotificationPreferences: () => Promise<void>;
    saveNotificationPreferences: (values: NotificationPreferenceUpdate) => Promise<void>;
    refreshNotificationsManually: () => Promise<void>;
    markAllNotificationsSeen: () => Promise<void>;
    markNotificationRead: (recipientId: string) => Promise<void>;
    dismissNotification: (recipientId: string) => Promise<void>;
    dismissAllNotifications: () => Promise<void>;
    setNotificationsError: (value: string | null) => void;
  };
};

const MobileNotificationsContext = createContext<MobileNotificationsSession | null>(
  null,
);

export function MobileNotificationsProvider({
  userId,
  audioSettings,
  children,
}: {
  userId: string;
  audioSettings: NotificationAudioSettings;
  children: ReactNode;
}) {
  const core = useHavenCore();
  const inbox = core.notifications;

  const notificationItems = inbox.useNotifications();
  const notificationCounts = inbox.useCounts();
  const notificationsLoading = inbox.useIsLoading();
  const notificationPreferences = inbox.usePreferences();
  const notificationPreferencesLoading = inbox.usePreferencesLoading();
  const notificationPreferencesSaving = inbox.usePreferencesSaving();

  const [notificationsRefreshing, setNotificationsRefreshing] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState<
    string | null
  >(null);

  const soundSyncRef = useRef(createNotificationSoundSyncState());
  const audioRef = useRef(audioSettings);

  useEffect(() => {
    audioRef.current = audioSettings;
  }, [audioSettings]);

  const refreshNotificationInbox = useCallback(async () => {
    if (!userId) return;
    await inbox.refreshInbox();
  }, [inbox, userId]);

  useEffect(() => {
    if (!userId) {
      resetNotificationSoundSyncState(soundSyncRef.current);
      inbox.setPreferences(null);
      return;
    }
    void bootstrapNotificationSoundSync(core, soundSyncRef.current);
  }, [core, inbox, userId]);

  useEffect(() => {
    if (!userId || !soundSyncRef.current.bootstrapped) return;
    void syncNotificationSounds(core, audioRef.current, soundSyncRef.current).catch(
      (error) => {
        console.error("Failed to play notification sounds:", error);
      },
    );
  }, [core, notificationItems.length, userId]);

  useEffect(() => {
    if (!userId) return;
    setNotificationPreferencesError(null);
    void inbox.loadPreferences().catch((error) => {
      setNotificationPreferencesError(
        getErrorMessage(error, "Failed to load notification preferences."),
      );
    });
  }, [inbox, userId]);

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

  const resetNotifications = useCallback(() => {
    setNotificationsRefreshing(false);
    setNotificationsError(null);
    setNotificationPreferencesError(null);
    inbox.setPreferences(null);
    resetNotificationSoundSyncState(soundSyncRef.current);
  }, [inbox]);

  const value = useMemo<MobileNotificationsSession>(
    () => ({
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
        refreshNotificationPreferences: async () => {
          if (!userId) return;
          await inbox.loadPreferences();
        },
        saveNotificationPreferences: async (values) => {
          setNotificationPreferencesError(null);
          try {
            await inbox.savePreferences(values);
          } catch (error) {
            setNotificationPreferencesError(
              getErrorMessage(error, "Failed to update notification preferences."),
            );
          }
        },
        refreshNotificationsManually: async () => {
          setNotificationsRefreshing(true);
          setNotificationsError(null);
          setNotificationPreferencesError(null);
          try {
            await inbox.refreshInbox();
            await inbox.loadPreferences();
          } catch (error) {
            setNotificationsError(getErrorMessage(error, "Failed to refresh notifications."));
          } finally {
            setNotificationsRefreshing(false);
          }
        },
        markAllNotificationsSeen: () => withRefresh(() => inbox.markAllSeen()),
        markNotificationRead: (recipientId) =>
          withRefresh(() => inbox.markRead([recipientId])),
        dismissNotification: (recipientId) =>
          withRefresh(() => inbox.dismiss([recipientId])),
        dismissAllNotifications: () => withRefresh(() => inbox.dismissAll()),
        setNotificationsError,
      },
    }),
    [
      inbox,
      notificationCounts,
      notificationItems,
      notificationPreferences,
      notificationPreferencesError,
      notificationPreferencesLoading,
      notificationPreferencesSaving,
      notificationsError,
      notificationsLoading,
      notificationsRefreshing,
      refreshNotificationInbox,
      resetNotifications,
      userId,
      withRefresh,
    ],
  );

  return (
    <MobileNotificationsContext.Provider value={value}>
      {children}
    </MobileNotificationsContext.Provider>
  );
}

export function useMobileNotifications(): MobileNotificationsSession {
  const ctx = useContext(MobileNotificationsContext);
  if (!ctx) {
    throw new Error("useMobileNotifications requires MobileNotificationsProvider.");
  }
  return ctx;
}
