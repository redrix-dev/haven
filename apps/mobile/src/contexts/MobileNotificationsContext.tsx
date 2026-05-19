import { createContext, useContext, type ReactNode } from "react";
import { useLiveProfiles } from "@shared/features/profile/hooks/useLiveProfiles";
import { useNotifications } from "@shared/features/notifications/hooks/useNotifications";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { MOBILE_DEFAULT_NOTIFICATION_AUDIO } from "@/constants/mobileNotificationAudioDefaults";

type NotificationsHookReturn = ReturnType<typeof useNotifications>;

const MobileNotificationsContext = createContext<NotificationsHookReturn | null>(null);

export function MobileNotificationsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const notifications = useNotifications({
    userId,
    audioSettings: MOBILE_DEFAULT_NOTIFICATION_AUDIO,
    autoMarkSeenOnPanelOpen: false,
  });

  useLiveProfiles({
    controlPlaneBackend: getControlPlaneBackend(),
    userId,
  });

  return (
    <MobileNotificationsContext.Provider value={notifications}>
      {children}
    </MobileNotificationsContext.Provider>
  );
}

export function useMobileNotifications(): NotificationsHookReturn {
  const ctx = useContext(MobileNotificationsContext);
  if (!ctx) {
    throw new Error("useMobileNotifications requires MobileNotificationsProvider.");
  }
  return ctx;
}
