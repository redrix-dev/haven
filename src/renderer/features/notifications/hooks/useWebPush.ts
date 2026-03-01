import React, { useEffect, useState } from 'react';
import type { HavenWebPushClientStatus } from '@/web/pwa/webPushClient';
import type {
  NotificationDeliveryTraceRecord,
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupDiagnostics,
} from '@/lib/backend/types';
import type { WebPushRouteDiagnosticsSnapshot } from '@/lib/notifications/webPushDiagnostics';
import { getNotificationBackend } from '@/lib/backend';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import { safeStableStringify } from '@/lib/deepLinks';
import { toast } from 'sonner';
interface UseWebPushOptions {
  notificationBackend: ReturnType<typeof getNotificationBackend>;
  webPushTestToolsEnabled: boolean;
  notificationsPanelOpen: boolean;
}

export function useWebPush({ notificationBackend, webPushTestToolsEnabled, notificationsPanelOpen }: UseWebPushOptions) {
  
  
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
      const loadWebPushModules = React.useCallback(async () => {
        if (desktopClient.isAvailable()) return null;
    
        const [serviceWorkerModule, webPushClientModule] = await Promise.all([
          import('@/web/pwa/registerServiceWorker'),
          import('@/web/pwa/webPushClient'),
        ]);
    
        return { serviceWorkerModule, webPushClientModule };
      }, []);
    
      const setWebPushTestResult = React.useCallback((label: string, details: unknown) => {
        const timestamp = new Date().toLocaleTimeString();
        const body =
          typeof details === 'string'
            ? details
            : safeStableStringify(details);
        setWebPushTestLastResult(`[${timestamp}] ${label}\n${body}`);
      }, []);
    
      const refreshWebPushStatus = React.useCallback(async () => {
        if (desktopClient.isAvailable()) {
          setWebPushStatus(null);
          setWebPushStatusError(null);
          setWebPushStatusLoading(false);
          return;
        }
    
        setWebPushStatusLoading(true);
        setWebPushStatusError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
          const status = await modules.webPushClientModule.getHavenWebPushClientStatus();
          setWebPushStatus(status);
        } catch (error) {
          setWebPushStatusError(getErrorMessage(error, 'Failed to load web push status.'));
        } finally {
          setWebPushStatusLoading(false);
        }
      }, [loadWebPushModules]);
    
      const refreshWebPushDiagnostics = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) {
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
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          const [routeDiagnostics, backendTraces, queueHealthDiagnostics, wakeupDiagnostics] =
            await Promise.all([
              modules.webPushClientModule.getHavenNotificationRouteDiagnostics(),
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
      }, [loadWebPushModules, notificationBackend, webPushTestToolsEnabled]);
    
      const setWebPushNotificationDevMode = React.useCallback(
        async (mode: 'real' | 'simulated_push' | 'hybrid') => {
          if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
          const modules = await loadWebPushModules();
          if (!modules) return;
          modules.webPushClientModule.setHavenNotificationDevMode(mode);
          await refreshWebPushDiagnostics();
          setWebPushTestResult('Set Notification Dev Mode', { mode });
        },
        [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
      );
    
      const setNotificationRouteSimulationFocus = React.useCallback(
        async (hasFocus: boolean) => {
          if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
          const modules = await loadWebPushModules();
          if (!modules) return;
          modules.webPushClientModule.setHavenNotificationRouteSimulationOverrides({ hasFocus });
          const trace = modules.webPushClientModule.simulateHavenNotificationRouteDecisionTrace();
          setWebPushTestResult(hasFocus ? 'Simulate Focused Route' : 'Simulate Background Route', trace);
          await refreshWebPushDiagnostics();
        },
        [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
      );
    
      const clearNotificationRouteSimulation = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
        const modules = await loadWebPushModules();
        if (!modules) return;
        modules.webPushClientModule.clearHavenNotificationRouteSimulationOverrides();
        await refreshWebPushDiagnostics();
        setWebPushTestResult('Clear Route Simulation', { ok: true });
      }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const recordNotificationRouteSimulationTrace = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
        const modules = await loadWebPushModules();
        if (!modules) return;
        const trace = modules.webPushClientModule.simulateHavenNotificationRouteDecisionTrace();
        setWebPushTestResult('Record Route Trace', trace);
        await refreshWebPushDiagnostics();
      }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const clearLocalNotificationTraces = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
        const modules = await loadWebPushModules();
        if (!modules) return;
        modules.webPushClientModule.clearHavenNotificationRouteDiagnostics();
        setWebPushTestResult('Clear Local Notification Traces', { ok: true });
        await refreshWebPushDiagnostics();
      }, [loadWebPushModules, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const enableWebPushOnThisDevice = React.useCallback(async () => {
        if (desktopClient.isAvailable()) return;
    
        setWebPushActionBusy(true);
        setWebPushStatusError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
          modules.webPushClientModule.enableHavenWebPushSync();
    
          const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
          await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);
    
          const statusBeforePermission = await modules.webPushClientModule.getHavenWebPushClientStatus();
          setWebPushStatus(statusBeforePermission);
    
          if (!statusBeforePermission.vapidPublicKeyConfigured) {
            throw new Error('Web push VAPID public key is not configured for this web build.');
          }
    
          if (!statusBeforePermission.secureContext) {
            throw new Error('Web push requires HTTPS (or localhost).');
          }
    
          const permission = await modules.webPushClientModule.requestHavenWebPushPermissionAndSync();
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus]);
    
      const disableWebPushOnThisDevice = React.useCallback(async () => {
        if (desktopClient.isAvailable()) return;
    
        setWebPushActionBusy(true);
        setWebPushStatusError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          modules.webPushClientModule.disableHavenWebPushSync();
          const removed = await modules.webPushClientModule.removeHavenWebPushSubscription();
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus]);
    
      const showServiceWorkerTestNotification = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
        setWebPushTestBusy(true);
        setWebPushTestError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
          const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
          await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);
    
          const reply = await modules.webPushClientModule.showHavenServiceWorkerTestNotification({
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const simulateServiceWorkerNotificationClick = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
        setWebPushTestBusy(true);
        setWebPushTestError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          modules.serviceWorkerModule.setHavenServiceWorkerRegistrationEnabled(true);
          const serviceWorkerResult = await modules.serviceWorkerModule.registerHavenServiceWorker();
          await modules.webPushClientModule.startHavenWebPushClient(serviceWorkerResult);
    
          const reply = await modules.webPushClientModule.simulateHavenServiceWorkerNotificationClick({
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const runWebPushWorkerOnceForTesting = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
        setWebPushTestBusy(true);
        setWebPushTestError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({ maxJobs: 10 });
          setWebPushTestResult('Run Worker Once', stats);
          toast.success('web-push-worker manual run completed.', { id: 'web-push-worker-manual-run' });
        } catch (error) {
          setWebPushTestError(getErrorMessage(error, 'Failed to run web push worker manually.'));
        } finally {
          await refreshWebPushStatus();
          await refreshWebPushDiagnostics();
          setWebPushTestBusy(false);
        }
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const runWebPushWorkerShadowOnceForTesting = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
        setWebPushTestBusy(true);
        setWebPushTestError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({
            maxJobs: 10,
            mode: 'shadow',
          });
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const runWebPushWorkerWakeupOnceForTesting = React.useCallback(async () => {
        if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
        setWebPushTestBusy(true);
        setWebPushTestError(null);
        try {
          const modules = await loadWebPushModules();
          if (!modules) return;
    
          const stats = await modules.webPushClientModule.runHavenWebPushWorkerOnce({
            maxJobs: 10,
            mode: 'wakeup',
          });
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
      }, [loadWebPushModules, refreshWebPushDiagnostics, refreshWebPushStatus, setWebPushTestResult, webPushTestToolsEnabled]);
    
      const updateWebPushWakeupConfigForTesting = React.useCallback(
        async (input: { enabled?: boolean | null; shadowMode?: boolean | null; minIntervalSeconds?: number | null }) => {
          if (desktopClient.isAvailable() || !webPushTestToolsEnabled) return;
    
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
        [notificationBackend, refreshWebPushDiagnostics, setWebPushTestResult, webPushTestToolsEnabled]
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
          if (desktopClient.isAvailable()) return;
          void refreshWebPushStatus();
          if (webPushTestToolsEnabled) {
            void refreshWebPushDiagnostics();
          }
        }, [notificationsPanelOpen, refreshWebPushDiagnostics, refreshWebPushStatus, webPushTestToolsEnabled]);

        
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




