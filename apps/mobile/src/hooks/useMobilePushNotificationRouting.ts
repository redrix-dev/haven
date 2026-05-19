import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { parseExpoPushNotificationData } from "@/features/notifications/utils/parseExpoPushNotificationData";
import { useMobilePushNavigationStore, dispatchParsedPayload } from "@/stores/mobilePushNavigationStore";

function notificationDedupeKey(
  response: Notifications.NotificationResponse,
): string | null {
  const raw = response.notification.request.content.data as Record<string, unknown> | undefined;
  if (!raw) return null;
  const eventId = typeof raw.eventId === "string" ? raw.eventId : "";
  const recipientId = typeof raw.recipientId === "string" ? raw.recipientId : "";
  if (eventId && recipientId) return `${eventId}:${recipientId}`;
  return response.notification.date?.toString() ?? null;
}

function routeNotificationResponse(response: Notifications.NotificationResponse): void {
  const parsed = parseExpoPushNotificationData(response.notification.request.content.data);
  if (!parsed) return;

  const { handlers, setPendingParsedPayload } = useMobilePushNavigationStore.getState();
  if (!handlers) {
    // Handlers aren't registered yet (e.g. cold-start race). Store the payload so
    // it's dispatched as soon as setHandlers is called in HavenTabNavigator.
    setPendingParsedPayload(parsed);
    return;
  }

  setPendingParsedPayload(null);
  dispatchParsedPayload(handlers, parsed);
}

/**
 * Tap / cold-start routing for Expo push payloads (`expo-push-worker` shape).
 * Requires handlers registered via `useMobilePushNavigationStore.setHandlers` from the tab shell.
 */
export function useMobilePushNotificationRouting(): void {
  const handledKeysRef = useRef<Set<string>>(new Set());

  const tryHandle = (response: Notifications.NotificationResponse) => {
    const key = notificationDedupeKey(response);
    if (key) {
      if (handledKeysRef.current.has(key)) return;
      handledKeysRef.current.add(key);
    }
    routeNotificationResponse(response);
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      tryHandle(response);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) tryHandle(response);
    });

    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      const parsed = parseExpoPushNotificationData(notification.request.content.data);
      if (
        parsed?.kind === "dm_message" ||
        parsed?.kind === "friend_request_received" ||
        parsed?.kind === "channel_mention"
      ) {
        useMobilePushNavigationStore.getState().handlers?.refreshUrgentSurfaces();
      }
    });

    return () => {
      sub.remove();
      foregroundSub.remove();
    };
  }, []);
}
