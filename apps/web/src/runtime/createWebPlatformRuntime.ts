import { asRecord, getRecordString } from '@platform/lib/records';
import type {
  PlatformBrowserPushRuntime,
  PlatformNotificationOpenEvent,
  PlatformNotificationRoutingSignals,
  PlatformRuntime,
} from '@platform/runtime/types';
import {
  clearHavenNotificationRouteDiagnostics,
  clearHavenNotificationRouteSimulationOverrides,
  disableHavenWebPushSync,
  enableHavenWebPushSync,
  getHavenNotificationRouteDiagnostics,
  getHavenWebPushClientStatus,
  getHavenWebPushRoutingSignalsSync,
  requestHavenWebPushPermissionAndSync,
  runHavenWebPushWorkerOnce,
  setHavenNotificationDevMode,
  setHavenNotificationRouteSimulationOverrides,
  showHavenServiceWorkerTestNotification,
  simulateHavenNotificationRouteDecisionTrace,
  simulateHavenServiceWorkerNotificationClick,
  startHavenWebPushClient,
  removeHavenWebPushSubscription,
} from '@platform/runtime/web/webPushClient';
import { registerHavenServiceWorker } from '@platform/runtime/web/registerServiceWorker';

const EMPTY_NOTIFICATION_SIGNALS: PlatformNotificationRoutingSignals = {
  pushSupported: false,
  pushPermission: 'unsupported',
  swRegistered: false,
  pushSubscriptionActive: false,
  pushSyncEnabled: false,
  serviceWorkerRegistrationEnabled: false,
};

const getOrigin = (): string | null => {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !origin || origin === 'null') {
    return null;
  }
  return origin;
};

function createBrowserPushRuntime(): PlatformBrowserPushRuntime {
  return {
    registerServiceWorker: registerHavenServiceWorker,
    start: startHavenWebPushClient,
    getStatus: getHavenWebPushClientStatus,
    enableSync: enableHavenWebPushSync,
    disableSync: disableHavenWebPushSync,
    requestPermissionAndSync: async () =>
      (await requestHavenWebPushPermissionAndSync()) ?? 'default',
    removeSubscription: removeHavenWebPushSubscription,
    getRouteDiagnostics: async () => {
      const diagnostics = getHavenNotificationRouteDiagnostics();
      return {
        mode: diagnostics.mode,
        decision: {
          routeMode: diagnostics.decision.routeMode,
          reasonCodes: diagnostics.decision.reasonCodes,
        },
        localTraces: diagnostics.localTraces as never,
      };
    },
    getRoutingSignalsSync: getHavenWebPushRoutingSignalsSync,
    setDevMode: setHavenNotificationDevMode,
    setSimulationFocus: (hasFocus) =>
      setHavenNotificationRouteSimulationOverrides({ hasFocus }),
    clearSimulation: clearHavenNotificationRouteSimulationOverrides,
    recordSimulationTrace: simulateHavenNotificationRouteDecisionTrace,
    clearDiagnostics: clearHavenNotificationRouteDiagnostics,
    showServiceWorkerTestNotification: showHavenServiceWorkerTestNotification,
    simulateServiceWorkerNotificationClick: simulateHavenServiceWorkerNotificationClick,
    runWorkerOnce: async (input) =>
      runHavenWebPushWorkerOnce(
        input?.mode && input.mode !== 'default'
          ? { maxJobs: input.maxJobs ?? 10, mode: input.mode }
          : { maxJobs: input?.maxJobs ?? 10 }
      ),
  };
}

function createNotificationOpenSubscriber(
  listener: (event: PlatformNotificationOpenEvent) => void
): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const data = asRecord(event.data);
    if (!data || data.type !== 'HAVEN_PUSH_NOTIFICATION_CLICK') return;

    listener({
      source: 'browser_push',
      targetUrl: getRecordString(data, 'targetUrl'),
      payload: data.payload,
    });
  };

  navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  return () => {
    navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
  };
}

export function createWebPlatformRuntime(): PlatformRuntime {
  const browserPush = createBrowserPushRuntime();

  return {
    kind: 'web',
    capabilities: {
      voicePopout: false,
      browserPush: true,
      nativePush: false,
      nativeKeyboard: false,
      fileSave: false,
      universalLinks: true,
    },
    links: {
      getAuthConfirmRedirectUrl: () => {
        const origin = getOrigin();
        return origin ? new URL('/auth/confirm', origin).toString() : 'haven://auth/confirm';
      },
      getInviteBaseUrl: () => {
        const origin = getOrigin();
        return origin ? new URL('/invite/', origin).toString() : 'haven://invite/';
      },
      getCurrentUrl: () => (typeof window === 'undefined' ? null : window.location.href),
      subscribeIncoming: () => () => {},
      consumePendingUrl: async () => null,
    },
    notifications: {
      transport: 'browser',
      getRoutingSignalsSync: () => {
        try {
          return browserPush.getRoutingSignalsSync();
        } catch {
          return EMPTY_NOTIFICATION_SIGNALS;
        }
      },
      subscribeOpen: createNotificationOpenSubscriber,
      browserPush,
      nativePush: null,
    },
    files: {
      openExternalUrl: (url) => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
      saveFileFromUrl: async ({ url }) => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return null;
      },
    },
    keyboard: null,
    desktop: null,
  };
}
