import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { requireHavenCore } from "@mobile-data";
import { pushTap } from "@/features/notifications/pushIntent";
import { openLinkIntent } from "@/stores/mobilePushNavigationStore";

function routeNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const tap = pushTap(response.notification.request.content.data);
  if (!tap) return;
  if (tap.notificationId) {
    void requireHavenCore()
      .notifications.mark("read", [tap.notificationId])
      .catch(() => {});
  }
  // Navigates now, or as soon as the signed-in shell registers its handlers.
  openLinkIntent(tap.intent);
}

/**
 * Tap and cold-start routing for pushes. A push that arrives while the app is
 * open needs nothing: realtime has already delivered the same notification.
 */
export function useMobilePushNotificationRouting(): void {
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tryHandle = (response: Notifications.NotificationResponse) => {
      const key = response.notification.request.identifier;
      if (handledRef.current.has(key)) return;
      handledRef.current.add(key);
      routeNotificationResponse(response);
    };

    const sub =
      Notifications.addNotificationResponseReceivedListener(tryHandle);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) tryHandle(response);
    });
    return () => sub.remove();
  }, []);
}
