/* Haven web service worker (v1 push-ready)
 * No offline caching yet. Push notifications and click-through deep links are supported.
 */

const SW_VERSION = 'push-v1';
const DEFAULT_NOTIFICATION_TITLE = 'Haven';
const DEFAULT_NOTIFICATION_ICON = '/icon-192.png';
const DEFAULT_NOTIFICATION_BADGE = '/icon-192.png';
const DEFAULT_TARGET_PATH = '/';
const DEBUG_NOTIFICATION_TAG = 'haven:debug:test';
const ROUTE_TRACE_MESSAGE_TYPE = 'HAVEN_PUSH_DELIVERY_TRACE';

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const toTrimmedString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const parsePushEventPayload = (event) => {
  if (!event || !event.data) return {};

  try {
    const json = event.data.json();
    return isPlainObject(json) ? json : {};
  } catch {
    try {
      const text = event.data.text();
      return text ? { message: text } : {};
    } catch {
      return {};
    }
  }
};

const normalizeNotificationPayload = (event) => {
  const payload = parsePushEventPayload(event);
  const notification = isPlainObject(payload.notification) ? payload.notification : {};
  const data = isPlainObject(payload.data) ? payload.data : {};
  const notificationData = isPlainObject(notification.data) ? notification.data : {};

  const title =
    toTrimmedString(notification.title) ??
    toTrimmedString(payload.title) ??
    DEFAULT_NOTIFICATION_TITLE;

  const body =
    toTrimmedString(notification.body) ??
    toTrimmedString(payload.body) ??
    toTrimmedString(payload.message) ??
    '';

  const icon =
    toTrimmedString(notification.icon) ??
    toTrimmedString(payload.icon) ??
    DEFAULT_NOTIFICATION_ICON;

  const badge =
    toTrimmedString(notification.badge) ??
    toTrimmedString(payload.badge) ??
    DEFAULT_NOTIFICATION_BADGE;

  const clickUrl =
    toTrimmedString(notificationData.url) ??
    toTrimmedString(notificationData.path) ??
    toTrimmedString(data.url) ??
    toTrimmedString(data.path) ??
    toTrimmedString(payload.url) ??
    toTrimmedString(payload.path) ??
    DEFAULT_TARGET_PATH;

  const tag =
    toTrimmedString(notification.tag) ??
    toTrimmedString(payload.tag) ??
    null;

  const requireInteraction =
    typeof notification.requireInteraction === 'boolean'
      ? notification.requireInteraction
      : typeof payload.requireInteraction === 'boolean'
        ? payload.requireInteraction
        : false;

  const renotify =
    typeof notification.renotify === 'boolean'
      ? notification.renotify
      : typeof payload.renotify === 'boolean'
        ? payload.renotify
        : false;

  const silent =
    typeof notification.silent === 'boolean'
      ? notification.silent
      : typeof payload.silent === 'boolean'
        ? payload.silent
        : false;

  const actions = Array.isArray(notification.actions)
    ? notification.actions
        .filter((action) => isPlainObject(action))
        .map((action) => ({
          action: toTrimmedString(action.action) ?? '',
          title: toTrimmedString(action.title) ?? '',
          icon: toTrimmedString(action.icon) ?? undefined,
        }))
        .filter((action) => action.action && action.title)
    : [];

  return {
    title,
    options: {
      body,
      icon,
      badge,
      tag: tag || undefined,
      requireInteraction,
      renotify,
      silent,
      actions,
      data: {
        url: clickUrl,
        kind: toTrimmedString(payload.kind) ?? toTrimmedString(data.kind) ?? null,
        payload,
      },
    },
  };
};

const resolveNotificationTargetUrl = (notification) => {
  const rawTarget =
    toTrimmedString(notification?.data?.url) ??
    toTrimmedString(notification?.data?.path) ??
    DEFAULT_TARGET_PATH;

  try {
    const candidate = new URL(rawTarget, self.location.origin);
    if (candidate.origin !== self.location.origin) {
      return new URL(DEFAULT_TARGET_PATH, self.location.origin).toString();
    }
    return candidate.toString();
  } catch {
    return new URL(DEFAULT_TARGET_PATH, self.location.origin).toString();
  }
};

const replyToMessage = (event, payload) => {
  try {
    const replyPort = Array.isArray(event?.ports) ? event.ports[0] : null;
    if (replyPort && typeof replyPort.postMessage === 'function') {
      replyPort.postMessage(payload);
      return;
    }
  } catch {
    // Ignore MessageChannel reply failures and try source.postMessage next.
  }

  try {
    event?.source?.postMessage?.(payload);
  } catch {
    // Ignore message reply failures.
  }
};

const broadcastToWindowClients = async (payload) => {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.postMessage(payload);
      } catch {
        // Ignore postMessage failures.
      }
    })
  );
};

const buildSwRouteDecision = ({ hasFocusedClient }) => {
  if (hasFocusedClient) {
    return {
      routeMode: 'foreground_in_app',
      allowOsPushDisplay: false,
      reasonCode: 'sw_focused_window_suppressed',
      decision: 'skip',
    };
  }

  return {
    routeMode: 'background_os_push',
    allowOsPushDisplay: true,
    reasonCode: 'sent',
    decision: 'send',
  };
};

const hasFocusedSameOriginWindowClient = async () => {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  for (const client of windowClients) {
    try {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) continue;

      if (client.focused === true) return true;
      if (client.visibilityState === 'visible') return true;
    } catch {
      // Ignore malformed client URLs.
    }
  }

  return false;
};

const focusOrOpenClientWindow = async (targetUrl, payload) => {
  const target = new URL(targetUrl);
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  let chosenClient = null;
  for (const client of windowClients) {
    try {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === target.origin) {
        chosenClient = client;
        if (clientUrl.pathname === target.pathname) {
          break;
        }
      }
    } catch {
      // Ignore malformed client URLs.
    }
  }

  if (chosenClient) {
    if (typeof chosenClient.navigate === 'function') {
      try {
        await chosenClient.navigate(targetUrl);
      } catch {
        // Navigation may fail for some browsers; focus and continue.
      }
    }

    try {
      chosenClient.postMessage({
        type: 'HAVEN_PUSH_NOTIFICATION_CLICK',
        targetUrl,
        payload,
      });
    } catch {
      // Ignore postMessage failures.
    }

    return chosenClient.focus();
  }

  return self.clients.openWindow(targetUrl);
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (!event || typeof event.data !== 'object' || event.data == null) return;

  if (event.data.type === 'HAVEN_SW_PING') {
    replyToMessage(event, {
      type: 'HAVEN_SW_PONG',
      ok: true,
      version: SW_VERSION,
    });
    return;
  }

  if (event.data.type === 'HAVEN_SW_DEBUG_SHOW_NOTIFICATION') {
    const title =
      toTrimmedString(event.data.title) ??
      `${DEFAULT_NOTIFICATION_TITLE} Debug Notification`;
    const body =
      toTrimmedString(event.data.body) ??
      'This is a local service worker test notification.';
    const targetUrl = (() => {
      try {
        return resolveNotificationTargetUrl({
          data: {
            url: toTrimmedString(event.data.targetUrl) ?? DEFAULT_TARGET_PATH,
          },
        });
      } catch {
        return new URL(DEFAULT_TARGET_PATH, self.location.origin).toString();
      }
    })();
    const payload = isPlainObject(event.data.payload) ? event.data.payload : {};

    const showPromise = self.registration
      .showNotification(title, {
        body,
        icon: DEFAULT_NOTIFICATION_ICON,
        badge: DEFAULT_NOTIFICATION_BADGE,
        tag: toTrimmedString(event.data.tag) ?? DEBUG_NOTIFICATION_TAG,
        renotify: true,
        data: {
          url: targetUrl,
          kind: toTrimmedString(event.data.kind) ?? toTrimmedString(payload.kind) ?? 'system',
          payload,
        },
      })
      .then(() => {
        replyToMessage(event, {
          type: 'HAVEN_SW_DEBUG_SHOW_NOTIFICATION_RESULT',
          ok: true,
          targetUrl,
          tag: toTrimmedString(event.data.tag) ?? DEBUG_NOTIFICATION_TAG,
          version: SW_VERSION,
        });
      })
      .catch((error) => {
        replyToMessage(event, {
          type: 'HAVEN_SW_DEBUG_SHOW_NOTIFICATION_RESULT',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          version: SW_VERSION,
        });
      });

    event.waitUntil(showPromise);
    return;
  }

  if (event.data.type === 'HAVEN_SW_DEBUG_SIMULATE_NOTIFICATION_CLICK') {
    const payload = isPlainObject(event.data.payload) ? event.data.payload : {};
    const targetUrl = (() => {
      try {
        return resolveNotificationTargetUrl({
          data: {
            url:
              toTrimmedString(event.data.targetUrl) ??
              toTrimmedString(payload.url) ??
              DEFAULT_TARGET_PATH,
          },
        });
      } catch {
        return new URL(DEFAULT_TARGET_PATH, self.location.origin).toString();
      }
    })();

    const clickPromise = focusOrOpenClientWindow(targetUrl, payload)
      .then(() => {
        replyToMessage(event, {
          type: 'HAVEN_SW_DEBUG_SIMULATE_NOTIFICATION_CLICK_RESULT',
          ok: true,
          targetUrl,
          version: SW_VERSION,
        });
      })
      .catch((error) => {
        replyToMessage(event, {
          type: 'HAVEN_SW_DEBUG_SIMULATE_NOTIFICATION_CLICK_RESULT',
          ok: false,
          targetUrl,
          error: error instanceof Error ? error.message : String(error),
          version: SW_VERSION,
        });
      });

    event.waitUntil(clickPromise);
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const hasFocusedClient = await hasFocusedSameOriginWindowClient();
      const normalized = normalizeNotificationPayload(event);
      const routeDecision = buildSwRouteDecision({ hasFocusedClient });

      await broadcastToWindowClients({
        type: ROUTE_TRACE_MESSAGE_TYPE,
        transport: 'web_push',
        stage: 'client_route',
        decision: routeDecision.decision,
        reasonCode: routeDecision.reasonCode,
        payload: normalized.options?.data?.payload ?? null,
        details: {
          routeMode: routeDecision.routeMode,
          hasFocusedClient,
        },
      });

      if (!routeDecision.allowOsPushDisplay) {
        return;
      }

      await self.registration.showNotification(normalized.title, normalized.options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification?.close();
  const targetUrl = resolveNotificationTargetUrl(event.notification);
  const payload = isPlainObject(event.notification?.data?.payload) ? event.notification.data.payload : {};

  event.waitUntil(
    focusOrOpenClientWindow(targetUrl, payload)
  );
});
