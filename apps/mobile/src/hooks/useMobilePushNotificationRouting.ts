import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { parseExpoPushNotificationData } from "@shared/features/mobile/push/parseExpoPushNotificationData";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";

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

  const handlers = useMobilePushNavigationStore.getState().handlers;
  if (!handlers) return;

  switch (parsed.kind) {
    case "dm_message":
      if (parsed.conversationId) {
        handlers.openDm(parsed.conversationId);
      } else {
        handlers.refreshUrgentSurfaces();
      }
      break;
    case "friend_request_received":
      handlers.openFriends({
        tab: "requests",
        highlightedRequestId: parsed.friendRequestId,
      });
      break;
    case "friend_request_accepted":
      handlers.openFriends({ tab: "friends", highlightedRequestId: null });
      break;
    case "channel_mention":
      if (parsed.communityId && parsed.channelId) {
        handlers.openMention(parsed.communityId, parsed.channelId);
      } else {
        handlers.refreshUrgentSurfaces();
      }
      break;
    case "system":
    default:
      handlers.openNotifications();
      break;
  }
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
