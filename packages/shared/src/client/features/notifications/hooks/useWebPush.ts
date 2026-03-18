import React, { useEffect, useState } from 'react';
import type { HavenWebPushClientStatus } from '@platform/runtime/web/webPushClient';
import type {
  NotificationDeliveryTraceRecord,
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupDiagnostics,
} from '@shared/lib/backend/types';
import type { WebPushRouteDiagnosticsSnapshot } from '@shared/lib/notifications/webPushDiagnostics';
import { getNotificationBackend } from '@shared/lib/backend';
import { getErrorMessage } from '@platform/lib/errors';
import { usePlatformRuntime } from '@platform/runtime/PlatformRuntimeContext';
import { safeStableStringify } from '@shared/lib/deepLinks';
import { toast } from 'sonner';

interface UseWebPushOptions {
  notificationBackend: ReturnType<typeof getNotificationBackend>;
  webPushTestToolsEnabled: boolean;
  notificationsPanelOpen: boolean;
}

export function useWebPush({
  notificationBackend,
  webPushTestToolsEnabled,
  notificationsPanelOpen,
}: UseWebPushOptions) {
  const runtime = usePlatformRuntime();
  const browserPush = runtime.notifications.browserPush;
  const nativePush = runtime.notifications.nativePush;
  const browserPushAvailable = Boolean(browserPush && runtime.capabilities.browserPush);
  const nativePushAvailable = Boolean(nativePush && runtime.capabilities.nativePush);

  const [webPushStatus, setWebPushStatus] = useState<HavenWebPushClientStatus | null>(null);
  const [webPushStatusLoading, setWebPushStatusLoading] = useState(false);
  const [webPushActionBusy, setWebPushActionBusy] = useState(false);
  const [webPushStatusError, setWebPushStatusError] = useState<string | null>(null);
  const [webPushTestBusy, setWebPushTestBusy] = useState(false);
  const [webPushTestError, setWebPushTestError] = useState<string | null>(null);
  const [webPushTestLastResult, setWebPushTestLastResult] = useState<string | null>(null);
  const [webPushDiagnosticsLoading, setWebPushDiagnosticsLoading] = useState(false);
  const [webPushDiagnosticsError, setWebPushDiagnosticsError] = useState<string | null>(null);
  const [webPushRouteDiagnostics, setWebPushRouteDiagnostics] =
    useState<WebPushRouteDiagnosticsSnapshot | null>(null);
  const [webPushBackendTraces, setWebPushBackendTraces] = useState<NotificationDeliveryTraceRecord[]>([]);
  const [webPushQueueHealthDiagnostics, setWebPushQueueHealthDiagnostics] =
    useState<WebPushDispatchQueueHealthDiagnostics | null>(null);
  const [webPushWakeupDiagnostics, setWebPushWakeupDiagnostics] =
    useState<WebPushDispatchWakeupDiagnostics | null>(null);

  const setWebPushTestResult = React.useCallback((label: string, details: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const body = typeof details === 'string' ? details : safeStableStringify(details);
    setWebPushTestLastResult(`[${timestamp}] ${label}\n${body}`);
  }, []);

  const refreshWebPushStatus = React.useCallback(async () => {
    if (browserPushAvailable && browserPush) {
      setWebPushStatusLoading(true);
      setWebPushStatusError(null);
      try {
        const status = await browserPush.getStatus();
        setWebPushStatus(status);
      } catch (error) {
        setWebPushStatusError(getErrorMessage(error, 'Failed to load web push status.'));
      } finally {
        setWebPushStatusLoading(false);
      }
      return;
    }

    if (nativePushAvailable && nativePush) {
      setWebPushStatusLoading(true);
      setWebPushStatusError(null);
      try {
        const routingSignals = runtime.notifications.getRoutingSignalsSync();
        const token = await nativePush.getToken();
        setWebPushStatus({
          supported: routingSignals.pushSupported,
          secureContext: true,
          supportsServiceWorker: false,
          supportsNotifications: routingSignals.pushSupported,
          supportsPushManager: routingSignals.pushSupported,
          serviceWorkerRegistrationEnabled: false,
          webPushSyncEnabled: routingSignals.pushPermission === 'granted',
          vapidPublicKeyConfigured: true,
          notificationPermission: routingSignals.pushPermission,
          serviceWorkerReady: false,
          browserSubscriptionActive: Boolean(token),
          browserSubscriptionEndpoint: token,
          backendSubscriptionCount: token ? 1 : 0,
          installationId: null,
        });
      } catch (error) {
        setWebPushStatusError(getErrorMessage(error, 'Failed to load push status.'));
      } finally {
        setWebPushStatusLoading(false);
      }
      return;
    }

    if (!browserPushAvailable) {
      setWebPushStatus(null);
      setWebPushStatusError(null);
      setWebPushStatusLoading(false);
    }
  }, [browserPush, browserPushAvailable, nativePush, nativePushAvailable, runtime.notifications]);

  const refreshWebPushDiagnostics = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) {
      setWebPushRouteDiagnostics(null);
      setWebPushBackendTraces([]);
      setWebPushQueueHealthDiagnostics(null);
      setWebPushWakeupDiagnostics(null);
      setWebPushDiagnosticsError(null);
      setWebPushDiagnosticsLoading(false);
      return;
    }

    setWebPushDiagnosticsLoading(true);
    setWebPushDiagnosticsError(null);
    try {
      const [routeDiagnostics, backendTraces, queueHealthDiagnostics, wakeupDiagnostics] =
        await Promise.all([
          browserPush.getRouteDiagnostics(),
          notificationBackend.listNotificationDeliveryTraces({ limit: 100 }),
          notificationBackend.getWebPushDispatchQueueHealthDiagnostics().catch(() => null),
          notificationBackend.getWebPushDispatchWakeupDiagnostics(),
        ]);

      setWebPushRouteDiagnostics({
        mode: routeDiagnostics.mode,
        decision: {
          routeMode: routeDiagnostics.decision.routeMode,
          reasonCodes: routeDiagnostics.decision.reasonCodes,
        },
        localTraces: routeDiagnostics.localTraces as unknown as NotificationDeliveryTraceRecord[],
      });
      setWebPushBackendTraces(backendTraces);
      setWebPushQueueHealthDiagnostics(queueHealthDiagnostics);
      setWebPushWakeupDiagnostics(wakeupDiagnostics);
    } catch (error) {
      setWebPushDiagnosticsError(getErrorMessage(error, 'Failed to load delivery diagnostics.'));
    } finally {
      setWebPushDiagnosticsLoading(false);
    }
  }, [browserPush, browserPushAvailable, notificationBackend, webPushTestToolsEnabled]);

  const setWebPushNotificationDevMode = React.useCallback(
    async (mode: 'real' | 'simulated_push' | 'hybrid') => {
      if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;
      browserPush.setDevMode(mode);
      await refreshWebPushDiagnostics();
      setWebPushTestResult('Set Notification Dev Mode', { mode });
    },
    [browserPush, browserPushAvailable, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const setNotificationRouteSimulationFocus = React.useCallback(
    async (hasFocus: boolean) => {
      if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;
      browserPush.setSimulationFocus(hasFocus);
      const trace = browserPush.recordSimulationTrace();
      setWebPushTestResult(hasFocus ? 'Simulate Focused Route' : 'Simulate Background Route', trace);
      await refreshWebPushDiagnostics();
    },
    [browserPush, browserPushAvailable, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const clearNotificationRouteSimulation = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;
    browserPush.clearSimulation();
    await refreshWebPushDiagnostics();
    setWebPushTestResult('Clear Route Simulation', { ok: true });
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const recordNotificationRouteSimulationTrace = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;
    const trace = browserPush.recordSimulationTrace();
    setWebPushTestResult('Record Route Trace', trace);
    await refreshWebPushDiagnostics();
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const clearLocalNotificationTraces = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;
    browserPush.clearDiagnostics();
    setWebPushTestResult('Clear Local Notification Traces', { ok: true });
    await refreshWebPushDiagnostics();
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);

  const enableWebPushOnThisDevice = React.useCallback(async () => {
    if (browserPushAvailable && browserPush) {
      setWebPushActionBusy(true);
      setWebPushStatusError(null);
      try {
        browserPush.enableSync();
        const serviceWorkerResult = await browserPush.registerServiceWorker();
        await browserPush.start(serviceWorkerResult);

        const statusBeforePermission = await browserPush.getStatus();
        setWebPushStatus(statusBeforePermission);

        if (!statusBeforePermission.vapidPublicKeyConfigured) {
          throw new Error('Web push VAPID public key is not configured for this web build.');
        }

        if (!statusBeforePermission.secureContext) {
          throw new Error('Web push requires HTTPS (or localhost).');
        }

        const permission = await browserPush.requestPermissionAndSync();
        if (permission === 'denied') {
          toast.error('Browser notifications are blocked for this site. Enable them in browser settings.', {
            id: 'web-push-permission-denied',
          });
        } else if (permission === 'granted') {
          toast.success('Web push enabled for this device.', { id: 'web-push-enabled' });
        }
      } catch (error) {
        setWebPushStatusError(getErrorMessage(error, 'Failed to enable web push on this device.'));
      } finally {
        await refreshWebPushStatus();
        await refreshWebPushDiagnostics();
        setWebPushActionBusy(false);
      }
      return;
    }

    if (!nativePushAvailable || !nativePush) return;

    setWebPushActionBusy(true);
    setWebPushStatusError(null);
    try {
      await nativePush.initialize();
      toast.success('Push notifications enabled for this device.', {
        id: 'native-push-enabled',
      });
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to enable push on this device.'));
    } finally {
      await refreshWebPushStatus();
      setWebPushActionBusy(false);
    }
  }, [
    browserPush,
    browserPushAvailable,
    nativePush,
    nativePushAvailable,
    refreshWebPushDiagnostics,
    refreshWebPushStatus,
  ]);

  const disableWebPushOnThisDevice = React.useCallback(async () => {
    if (browserPushAvailable && browserPush) {
      setWebPushActionBusy(true);
      setWebPushStatusError(null);
      try {
        browserPush.disableSync();
        const removed = await browserPush.removeSubscription();
        toast.success(
          removed
            ? 'Web push disabled for this device.'
            : 'Web push sync disabled for this device.',
          { id: 'web-push-disabled' }
        );
      } catch (error) {
        setWebPushStatusError(getErrorMessage(error, 'Failed to disable web push on this device.'));
      } finally {
        await refreshWebPushStatus();
        await refreshWebPushDiagnostics();
        setWebPushActionBusy(false);
      }
      return;
    }

    if (!nativePushAvailable || !nativePush) return;

    setWebPushActionBusy(true);
    setWebPushStatusError(null);
    try {
      await nativePush.unregister();
      toast.success('Push notifications disabled for this device.', {
        id: 'native-push-disabled',
      });
    } catch (error) {
      setWebPushStatusError(getErrorMessage(error, 'Failed to disable push on this device.'));
    } finally {
      await refreshWebPushStatus();
      setWebPushActionBusy(false);
    }
  }, [
    browserPush,
    browserPushAvailable,
    nativePush,
    nativePushAvailable,
    refreshWebPushDiagnostics,
    refreshWebPushStatus,
  ]);

  const showServiceWorkerTestNotification = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const serviceWorkerResult = await browserPush.registerServiceWorker();
      await browserPush.start(serviceWorkerResult);

      const reply = await browserPush.showServiceWorkerTestNotification({
        title: 'Haven Push Test',
        body: 'Local service worker notification test from Push Test Tools.',
        targetUrl: '/?kind=friend_request_accepted',
        kind: 'friend_request_accepted',
        payload: {
          kind: 'friend_request_accepted',
          source: 'web_push_test_tools',
        },
      });

      setWebPushTestResult('Show SW Test Notification', reply ?? { ok: true });
      toast.success('Service worker test notification requested.', { id: 'web-push-test-sw-show' });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to show service worker test notification.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const simulateServiceWorkerNotificationClick = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const serviceWorkerResult = await browserPush.registerServiceWorker();
      await browserPush.start(serviceWorkerResult);

      const reply = await browserPush.simulateServiceWorkerNotificationClick({
        targetUrl: '/?kind=friend_request_accepted',
        payload: {
          kind: 'friend_request_accepted',
          source: 'web_push_test_tools',
        },
      });

      setWebPushTestResult('Simulate SW Click', reply ?? { ok: true });
      toast.success('Simulated service worker notification click sent.', {
        id: 'web-push-test-sw-click',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to simulate service worker click.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerOnceForTesting = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const stats = await browserPush.runWorkerOnce({ maxJobs: 10 });
      setWebPushTestResult('Run Worker Once', stats);
      toast.success('web-push-worker manual run completed.', { id: 'web-push-worker-manual-run' });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker manually.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerShadowOnceForTesting = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const stats = await browserPush.runWorkerOnce({ maxJobs: 10, mode: 'shadow' });
      setWebPushTestResult('Run Worker Shadow', stats);
      toast.success('web-push-worker shadow dry run completed.', {
        id: 'web-push-worker-shadow-run',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker shadow dry run.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const runWebPushWorkerWakeupOnceForTesting = React.useCallback(async () => {
    if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

    setWebPushTestBusy(true);
    setWebPushTestError(null);
    try {
      const stats = await browserPush.runWorkerOnce({ maxJobs: 10, mode: 'wakeup' });
      setWebPushTestResult('Run Worker Wakeup', stats);
      toast.success('web-push-worker wakeup-mode run completed.', {
        id: 'web-push-worker-wakeup-run',
      });
    } catch (error) {
      setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker in wakeup mode.'));
    } finally {
      await refreshWebPushStatus();
      await refreshWebPushDiagnostics();
      setWebPushTestBusy(false);
    }
  }, [browserPush, browserPushAvailable, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);

  const updateWebPushWakeupConfigForTesting = React.useCallback(
    async (input: { enabled?: boolean | null; shadowMode?: boolean | null; minIntervalSeconds?: number | null }) => {
      if (!browserPushAvailable || !browserPush || !webPushTestToolsEnabled) return;

      setWebPushTestBusy(true);
      setWebPushTestError(null);
      try {
        const updated = await notificationBackend.updateWebPushDispatchWakeupConfig(input);
        setWebPushWakeupDiagnostics(updated);
        setWebPushTestResult('Update Wakeup Scheduler Config', {
          enabled: updated.enabled,
          shadowMode: updated.shadowMode,
          minIntervalSeconds: updated.minIntervalSeconds,
          lastMode: updated.lastMode,
          lastReason: updated.lastReason,
          lastSkipReason: updated.lastSkipReason,
        });
        toast.success('Web push wakeup scheduler config updated.', {
          id: 'web-push-wakeup-config-updated',
        });
      } catch (error) {
        setWebPushTestError(getErrorMessage(error, 'Failed to update wakeup scheduler config.'));
      } finally {
        await refreshWebPushDiagnostics();
        setWebPushTestBusy(false);
      }
    },
    [browserPush, browserPushAvailable, notificationBackend, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
  );

  const reset = React.useCallback(() => {
    setWebPushStatus(null);
    setWebPushStatusError(null);
    setWebPushStatusLoading(false);
    setWebPushActionBusy(false);
    setWebPushTestBusy(false);
    setWebPushTestError(null);
    setWebPushTestLastResult(null);
  }, []);

  useEffect(() => {
    if (!notificationsPanelOpen) return;
    if (!browserPushAvailable && !nativePushAvailable) return;
    void refreshWebPushStatus();
    if (browserPushAvailable && webPushTestToolsEnabled) {
      void refreshWebPushDiagnostics();
    }
  }, [
    browserPushAvailable,
    nativePushAvailable,
    notificationsPanelOpen,
    refreshWebPushDiagnostics,
    refreshWebPushStatus,
    webPushTestToolsEnabled,
  ]);

  return {
    state: {
      webPushStatus,
      webPushStatusLoading,
      webPushActionBusy,
      webPushStatusError,
      webPushTestBusy,
      webPushTestError,
      webPushTestLastResult,
      webPushDiagnosticsLoading,
      webPushDiagnosticsError,
      webPushRouteDiagnostics,
      webPushBackendTraces,
      webPushQueueHealthDiagnostics,
      webPushWakeupDiagnostics,
    },
    actions: {
      enableWebPushOnThisDevice,
      disableWebPushOnThisDevice,
      refreshWebPushStatus,
      refreshWebPushDiagnostics,
      showServiceWorkerTestNotification,
      simulateServiceWorkerNotificationClick,
      runWebPushWorkerOnceForTesting,
      runWebPushWorkerShadowOnceForTesting,
      runWebPushWorkerWakeupOnceForTesting,
      updateWebPushWakeupConfigForTesting,
      setWebPushNotificationDevMode,
      setNotificationRouteSimulationFocus,
      clearNotificationRouteSimulation,
      recordNotificationRouteSimulationTrace,
      clearLocalNotificationTraces,
      reset,
    },
  };
}
