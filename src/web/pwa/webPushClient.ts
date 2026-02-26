import { getNotificationBackend } from '@/lib/backend';
import {
  clearLocalNotificationDeliveryTraces,
  listLocalNotificationDeliveryTraces,
  recordLocalNotificationDeliveryTrace,
  type LocalNotificationDeliveryTraceRecord,
} from '@/lib/notifications/devTrace';
import {
  resolveNotificationRoutePolicy,
  type NotificationDeliveryReasonCode,
  type NotificationRoutePolicyDecision,
} from '@/lib/notifications/routePolicy';
import { supabase } from '@/lib/supabase';
import {
  getWebPwaCapabilities,
  isHavenServiceWorkerRegistrationEnabled,
  type RegisterServiceWorkerResult,
} from './registerServiceWorker';

const WEB_PUSH_ENABLE_STORAGE_KEY = 'haven:pwa:web-push-enabled';
const WEB_PUSH_VAPID_PUBLIC_KEY_STORAGE_KEY = 'haven:pwa:web-push-vapid-public-key';
const WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY = 'haven:pwa:web-push-active-endpoint';
const WEB_PUSH_INSTALLATION_ID_STORAGE_KEY = 'haven:pwa:web-push-installation-id';
const NOTIFICATION_DEV_MODE_STORAGE_KEY = 'haven:notifications:dev-mode';
const NOTIFICATION_ROUTE_SIM_OVERRIDES_STORAGE_KEY = 'haven:notifications:route-sim-overrides';

let webPushClientStarted = false;
let authSubscription:
  | {
      unsubscribe: () => void;
    }
  | null = null;
let activeServiceWorkerRegistration: ServiceWorkerRegistration | null = null;
let syncInFlight: Promise<void> | null = null;

const getSafeLocalStorageValue = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setSafeLocalStorageValue = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode or restricted contexts.
  }
};

const removeSafeLocalStorageValue = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in private mode or restricted contexts.
  }
};

const createInstallationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wpi_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

export const getOrCreateHavenWebPushInstallationId = (): string | null => {
  if (typeof window === 'undefined') return null;

  const existing = getSafeLocalStorageValue(WEB_PUSH_INSTALLATION_ID_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const created = createInstallationId();
  setSafeLocalStorageValue(WEB_PUSH_INSTALLATION_ID_STORAGE_KEY, created);
  return created;
};

const getConfiguredVapidPublicKey = (): string | null => {
  const storageOverride = getSafeLocalStorageValue(WEB_PUSH_VAPID_PUBLIC_KEY_STORAGE_KEY)?.trim();
  if (storageOverride) return storageOverride;

  const envValue = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return envValue || null;
};

export const isHavenWebPushSyncEnabled = (): boolean =>
  getSafeLocalStorageValue(WEB_PUSH_ENABLE_STORAGE_KEY) === '1';

export const isHavenWebPushDesktopDeliveryLikelyActive = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (!isHavenServiceWorkerRegistrationEnabled()) return false;
  if (!isHavenWebPushSyncEnabled()) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  return Boolean(getSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY)?.trim());
};

export type HavenWebPushRoutingSignals = {
  pushSupported: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  swRegistered: boolean;
  pushSubscriptionActive: boolean;
  pushSyncEnabled: boolean;
  serviceWorkerRegistrationEnabled: boolean;
};

export type HavenNotificationDevMode = 'real' | 'simulated_push' | 'hybrid';

type StoredRouteSimulationOverrides = {
  hasFocus?: boolean;
  pushSupported?: boolean;
  pushPermission?: NotificationPermission | 'unsupported';
  swRegistered?: boolean;
  pushSubscriptionActive?: boolean;
  pushSyncEnabled?: boolean;
  serviceWorkerRegistrationEnabled?: boolean;
};

export type HavenNotificationRouteDiagnostics = {
  mode: HavenNotificationDevMode;
  signals: HavenWebPushRoutingSignals;
  decision: NotificationRoutePolicyDecision;
  simulationOverrides: StoredRouteSimulationOverrides | null;
  localTraces: LocalNotificationDeliveryTraceRecord[];
};

export const getHavenWebPushRoutingSignalsSync = (): HavenWebPushRoutingSignals => {
  const supportsNotifications = typeof window !== 'undefined' && 'Notification' in window;
  const supportsPushManager = typeof window !== 'undefined' && 'PushManager' in window;
  const supportsServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const activeEndpoint = getSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY)?.trim() || null;

  return {
    pushSupported: supportsNotifications && supportsPushManager && supportsServiceWorker,
    pushPermission: supportsNotifications ? Notification.permission : 'unsupported',
    swRegistered: Boolean(activeServiceWorkerRegistration || activeEndpoint),
    pushSubscriptionActive: Boolean(activeEndpoint),
    pushSyncEnabled: isHavenWebPushSyncEnabled(),
    serviceWorkerRegistrationEnabled: isHavenServiceWorkerRegistrationEnabled(),
  };
};

const parseRouteSimulationOverrides = (): StoredRouteSimulationOverrides | null => {
  const raw = getSafeLocalStorageValue(NOTIFICATION_ROUTE_SIM_OVERRIDES_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: StoredRouteSimulationOverrides = {};
    if (typeof parsed.hasFocus === 'boolean') out.hasFocus = parsed.hasFocus;
    if (typeof parsed.pushSupported === 'boolean') out.pushSupported = parsed.pushSupported;
    if (
      parsed.pushPermission === 'granted' ||
      parsed.pushPermission === 'denied' ||
      parsed.pushPermission === 'default' ||
      parsed.pushPermission === 'unsupported'
    ) {
      out.pushPermission = parsed.pushPermission;
    }
    if (typeof parsed.swRegistered === 'boolean') out.swRegistered = parsed.swRegistered;
    if (typeof parsed.pushSubscriptionActive === 'boolean') {
      out.pushSubscriptionActive = parsed.pushSubscriptionActive;
    }
    if (typeof parsed.pushSyncEnabled === 'boolean') out.pushSyncEnabled = parsed.pushSyncEnabled;
    if (typeof parsed.serviceWorkerRegistrationEnabled === 'boolean') {
      out.serviceWorkerRegistrationEnabled = parsed.serviceWorkerRegistrationEnabled;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
};

export const getHavenNotificationDevMode = (): HavenNotificationDevMode => {
  const raw = getSafeLocalStorageValue(NOTIFICATION_DEV_MODE_STORAGE_KEY)?.trim();
  return raw === 'simulated_push' || raw === 'hybrid' ? raw : 'real';
};

export const setHavenNotificationDevMode = (mode: HavenNotificationDevMode): void => {
  setSafeLocalStorageValue(NOTIFICATION_DEV_MODE_STORAGE_KEY, mode);
};

export const setHavenNotificationRouteSimulationOverrides = (
  overrides: StoredRouteSimulationOverrides | null
): void => {
  if (!overrides) {
    removeSafeLocalStorageValue(NOTIFICATION_ROUTE_SIM_OVERRIDES_STORAGE_KEY);
    return;
  }
  setSafeLocalStorageValue(NOTIFICATION_ROUTE_SIM_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
};

export const clearHavenNotificationRouteSimulationOverrides = (): void => {
  removeSafeLocalStorageValue(NOTIFICATION_ROUTE_SIM_OVERRIDES_STORAGE_KEY);
};

const getRoutePolicyDecisionForCurrentBrowser = (): NotificationRoutePolicyDecision => {
  const signals = getHavenWebPushRoutingSignalsSync();
  const overrides = parseRouteSimulationOverrides();
  const hasFocus = typeof document !== 'undefined' ? document.hasFocus() : true;
  return resolveNotificationRoutePolicy({
    hasFocus,
    pushSupported: signals.pushSupported,
    pushPermission: signals.pushPermission,
    swRegistered: signals.swRegistered,
    pushSubscriptionActive: signals.pushSubscriptionActive,
    pushSyncEnabled: signals.pushSyncEnabled,
    serviceWorkerRegistrationEnabled: signals.serviceWorkerRegistrationEnabled,
    audioSettings: {
      masterSoundEnabled: true,
      playSoundsWhenFocused: true,
    },
    developerOverrides: overrides
      ? {
          forceHasFocus: overrides.hasFocus,
          forcePushSupported: overrides.pushSupported,
          forcePushPermission: overrides.pushPermission,
          forceSwRegistered: overrides.swRegistered,
          forcePushSubscriptionActive: overrides.pushSubscriptionActive,
          forcePushSyncEnabled: overrides.pushSyncEnabled,
          forceServiceWorkerRegistrationEnabled: overrides.serviceWorkerRegistrationEnabled,
        }
      : undefined,
  });
};

export const getHavenNotificationRouteDiagnostics = (): HavenNotificationRouteDiagnostics => {
  const signals = getHavenWebPushRoutingSignalsSync();
  return {
    mode: getHavenNotificationDevMode(),
    signals,
    decision: getRoutePolicyDecisionForCurrentBrowser(),
    simulationOverrides: parseRouteSimulationOverrides(),
    localTraces: listLocalNotificationDeliveryTraces(40),
  };
};

export const clearHavenNotificationRouteDiagnostics = (): void => {
  clearLocalNotificationDeliveryTraces();
};

export const simulateHavenNotificationRouteDecisionTrace = (input?: {
  reasonCode?: NotificationDeliveryReasonCode;
  recipientId?: string;
  eventId?: string;
}): LocalNotificationDeliveryTraceRecord => {
  const diagnostics = getHavenNotificationRouteDiagnostics();
  const decision = diagnostics.decision;
  const reasonCode = input?.reasonCode ?? decision.reasonCodes[0] ?? 'sent';
  return recordLocalNotificationDeliveryTrace({
    notificationRecipientId: input?.recipientId ?? null,
    eventId: input?.eventId ?? null,
    transport: diagnostics.mode === 'simulated_push' ? 'simulated_push' : 'route_policy',
    stage: 'client_route',
    decision: decision.allowOsPushDisplay ? 'send' : 'skip',
    reasonCode,
    details: {
      routeMode: decision.routeMode,
      mode: diagnostics.mode,
      signals: diagnostics.signals,
      simulationOverrides: diagnostics.simulationOverrides,
      routeReasons: decision.reasonCodes,
    },
  });
};

const getClientPlatform = (): string | null => {
  if (typeof navigator === 'undefined') return null;

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  const platform = navigatorWithUAData.userAgentData?.platform ?? navigator.platform;
  const trimmed = typeof platform === 'string' ? platform.trim() : '';
  return trimmed || null;
};

const getAppDisplayMode = (): string | null => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;

  const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return 'standalone';

  if (typeof window.matchMedia !== 'function') return null;

  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  if (window.matchMedia('(display-mode: browser)').matches) return 'browser';
  return null;
};

const base64UrlToUint8Array = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer | null): string | null => {
  if (!buffer) return null;

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const getPushSubscriptionKeys = (
  subscription: PushSubscription
): { p256dhKey: string; authKey: string } | null => {
  const p256dhKey = arrayBufferToBase64Url(subscription.getKey('p256dh'));
  const authKey = arrayBufferToBase64Url(subscription.getKey('auth'));

  if (!p256dhKey || !authKey) {
    return null;
  }

  return { p256dhKey, authKey };
};

const getPushSubscriptionExpirationTime = (subscription: PushSubscription): string | null => {
  const rawExpiration = subscription.expirationTime;
  if (typeof rawExpiration !== 'number' || !Number.isFinite(rawExpiration)) {
    return null;
  }

  try {
    return new Date(rawExpiration).toISOString();
  } catch {
    return null;
  }
};

const ensurePushSubscription = async (
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> => {
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey) as unknown as BufferSource,
  });
};

const syncWebPushSubscriptionOnce = async (): Promise<void> => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!activeServiceWorkerRegistration) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if (!isHavenWebPushSyncEnabled()) return;

  const vapidPublicKey = getConfiguredVapidPublicKey();
  if (!vapidPublicKey) return;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user?.id) return;

  const subscription = await ensurePushSubscription(activeServiceWorkerRegistration, vapidPublicKey);
  if (!subscription) return;
  const previousEndpoint = getSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY)?.trim() || null;
  const currentUserAgent = navigator.userAgent ?? null;
  const currentClientPlatform = getClientPlatform();
  const currentAppDisplayMode = getAppDisplayMode();
  const installationId = getOrCreateHavenWebPushInstallationId();

  const keys = getPushSubscriptionKeys(subscription);
  if (!keys) {
    console.warn('Web push subscription is missing encryption keys; skipping backend sync.');
    return;
  }

  const upsertedSubscription = await getNotificationBackend().upsertWebPushSubscription({
    endpoint: subscription.endpoint,
    installationId,
    p256dhKey: keys.p256dhKey,
    authKey: keys.authKey,
    expirationTime: getPushSubscriptionExpirationTime(subscription),
    userAgent: currentUserAgent,
    clientPlatform: currentClientPlatform,
    appDisplayMode: currentAppDisplayMode,
    metadata: {
      swScope: activeServiceWorkerRegistration.scope,
      syncSource: 'web_pwa_runtime',
      installationId,
    },
  });

  if (previousEndpoint && previousEndpoint !== subscription.endpoint) {
    try {
      await getNotificationBackend().deleteWebPushSubscription(previousEndpoint);
    } catch (error) {
      console.warn('Failed to delete superseded web push subscription endpoint:', error);
    }
  }

  try {
    const allSubscriptions = await getNotificationBackend().listWebPushSubscriptions();
    const staleSameDeviceEndpoints = allSubscriptions
      .filter((row) => row.endpoint !== upsertedSubscription.endpoint)
      .filter((row) =>
        installationId
          ? row.installationId === installationId
          : (row.userAgent ?? null) === currentUserAgent &&
            (row.clientPlatform ?? null) === currentClientPlatform &&
            (row.appDisplayMode ?? null) === currentAppDisplayMode
      )
      .map((row) => row.endpoint);

    for (const endpoint of new Set(staleSameDeviceEndpoints)) {
      try {
        await getNotificationBackend().deleteWebPushSubscription(endpoint);
      } catch (error) {
        console.warn('Failed to delete duplicate same-device web push subscription endpoint:', error);
      }
    }
  } catch (error) {
    console.warn('Failed to scan for duplicate same-device web push subscriptions:', error);
  }

  setSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY, subscription.endpoint);
};

const enqueueSync = async (): Promise<void> => {
  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    try {
      await syncWebPushSubscriptionOnce();
    } catch (error) {
      console.warn('Failed to sync web push subscription:', error);
    } finally {
      syncInFlight = null;
    }
  })();

  await syncInFlight;
};

export const enableHavenWebPushSync = (): void => {
  setSafeLocalStorageValue(WEB_PUSH_ENABLE_STORAGE_KEY, '1');
};

export const disableHavenWebPushSync = (): void => {
  setSafeLocalStorageValue(WEB_PUSH_ENABLE_STORAGE_KEY, '0');
};

export type HavenWebPushClientStatus = {
  supported: boolean;
  secureContext: boolean;
  supportsServiceWorker: boolean;
  supportsNotifications: boolean;
  supportsPushManager: boolean;
  serviceWorkerRegistrationEnabled: boolean;
  webPushSyncEnabled: boolean;
  vapidPublicKeyConfigured: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  serviceWorkerReady: boolean;
  browserSubscriptionActive: boolean;
  browserSubscriptionEndpoint: string | null;
  backendSubscriptionCount: number | null;
  installationId: string | null;
};

type ServiceWorkerMessageReply = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type HavenWebPushWorkerRunStats = {
  mode?: 'cron' | 'manual' | string;
  wakeSource?: 'cron' | 'manual' | 'wakeup' | 'shadow' | string;
  shadow?: boolean;
  claimedJobs?: number;
  shadowWouldSend?: number;
  sent?: number;
  skipped?: number;
  retryableFailures?: number;
  deadLetters?: number;
  invalidatedSubscriptions?: number;
  shadowWouldSendByReason?: Record<string, number>;
  sentByReason?: Record<string, number>;
  skippedByReason?: Record<string, number>;
  retryableFailuresByReason?: Record<string, number>;
  deadLettersByReason?: Record<string, number>;
  latencyMsBuckets?: Record<string, number>;
  [key: string]: unknown;
};

const getServiceWorkerMessageTarget = (
  registration: ServiceWorkerRegistration
): ServiceWorker | null =>
  registration.active ??
  registration.waiting ??
  registration.installing ??
  navigator.serviceWorker.controller ??
  null;

const postMessageToServiceWorkerWithReply = async (
  message: Record<string, unknown>,
  timeoutMs = 3000
): Promise<ServiceWorkerMessageReply | null> => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;

  const registration = await getActiveOrReadyRegistration();
  if (!registration) {
    throw new Error('Haven service worker is not registered for this browser.');
  }

  const target = getServiceWorkerMessageTarget(registration);
  if (!target) {
    throw new Error('Haven service worker is not active yet. Reload after registration and try again.');
  }

  return new Promise<ServiceWorkerMessageReply | null>((resolve, reject) => {
    const channel = new MessageChannel();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out waiting for service worker response.'));
    }, Math.max(250, timeoutMs));

    channel.port1.onmessage = (event) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const data = event.data;
      resolve(data && typeof data === 'object' ? (data as ServiceWorkerMessageReply) : null);
    };

    try {
      target.postMessage(message, [channel.port2]);
    } catch (error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};

const getActiveOrReadyRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (activeServiceWorkerRegistration) {
    return activeServiceWorkerRegistration;
  }
  return resolveRegistrationFromResult(null);
};

export const showHavenServiceWorkerTestNotification = async (input?: {
  title?: string;
  body?: string;
  targetUrl?: string;
  kind?: string;
  payload?: Record<string, unknown>;
}): Promise<ServiceWorkerMessageReply | null> => {
  return postMessageToServiceWorkerWithReply({
    type: 'HAVEN_SW_DEBUG_SHOW_NOTIFICATION',
    title: input?.title ?? 'Haven Push Test',
    body: input?.body ?? 'Local service worker notification test.',
    targetUrl: input?.targetUrl ?? '/?kind=friend_request_accepted',
    kind: input?.kind ?? 'friend_request_accepted',
    payload:
      input?.payload ??
      ({
        kind: 'friend_request_accepted',
        source: 'web_push_test_tools',
      } satisfies Record<string, unknown>),
  });
};

export const simulateHavenServiceWorkerNotificationClick = async (input?: {
  targetUrl?: string;
  payload?: Record<string, unknown>;
}): Promise<ServiceWorkerMessageReply | null> => {
  return postMessageToServiceWorkerWithReply({
    type: 'HAVEN_SW_DEBUG_SIMULATE_NOTIFICATION_CLICK',
    targetUrl: input?.targetUrl ?? '/?kind=friend_request_accepted',
    payload:
      input?.payload ??
      ({
        kind: 'friend_request_accepted',
        source: 'web_push_test_tools',
      } satisfies Record<string, unknown>),
  });
};

export const syncHavenWebPushSubscriptionNow = async (): Promise<void> => {
  await syncWebPushSubscriptionOnce();
};

export const removeHavenWebPushSubscription = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const registration = await getActiveOrReadyRegistration();
  if (!registration) return false;

  const existing = await registration.pushManager.getSubscription();
  if (!existing) return false;

  const endpoint = existing.endpoint;

  let backendDeleted = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user?.id) {
      backendDeleted = await getNotificationBackend().deleteWebPushSubscription(endpoint);
    }
  } catch (error) {
    console.warn('Failed to delete web push subscription from backend:', error);
  }

  const unsubscribed = await existing.unsubscribe().catch((error) => {
    console.warn('Failed to unsubscribe browser web push subscription:', error);
    return false;
  });

  if (backendDeleted || unsubscribed) {
    removeSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY);
  }

  return backendDeleted || unsubscribed;
};

export const getHavenWebPushClientStatus = async (): Promise<HavenWebPushClientStatus> => {
  const capabilities = getWebPwaCapabilities();
  if (!capabilities) {
    return {
      supported: false,
      secureContext: false,
      supportsServiceWorker: false,
      supportsNotifications: false,
      supportsPushManager: false,
      serviceWorkerRegistrationEnabled: false,
      webPushSyncEnabled: false,
      vapidPublicKeyConfigured: false,
      notificationPermission: 'unsupported',
      serviceWorkerReady: false,
      browserSubscriptionActive: false,
      browserSubscriptionEndpoint: null,
      backendSubscriptionCount: null,
      installationId: null,
    };
  }

  const permission =
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported';

  let registration: ServiceWorkerRegistration | null = null;
  let browserSubscription: PushSubscription | null = null;
  let backendSubscriptionCount: number | null = null;

  if (capabilities.supportsServiceWorker && capabilities.supportsPushManager) {
    registration = await getActiveOrReadyRegistration();
    if (registration) {
      activeServiceWorkerRegistration = registration;
      browserSubscription = await registration.pushManager.getSubscription().catch(() => null);
    }
  }

  const endpoint = browserSubscription?.endpoint ?? null;
  const storedEndpoint = getSafeLocalStorageValue(WEB_PUSH_ACTIVE_ENDPOINT_STORAGE_KEY)?.trim() || null;
  const installationId = getOrCreateHavenWebPushInstallationId();
  if (endpoint) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session?.user?.id) {
        const backendRows = await getNotificationBackend().listWebPushSubscriptions();
        backendSubscriptionCount = backendRows.filter((row) => row.endpoint === endpoint).length;
      }
    } catch (error) {
      console.warn('Failed to load backend web push subscription status:', error);
    }
  }

  return {
    supported:
      capabilities.secureContext &&
      capabilities.supportsServiceWorker &&
      capabilities.supportsNotifications &&
      capabilities.supportsPushManager,
    secureContext: capabilities.secureContext,
    supportsServiceWorker: capabilities.supportsServiceWorker,
    supportsNotifications: capabilities.supportsNotifications,
    supportsPushManager: capabilities.supportsPushManager,
    serviceWorkerRegistrationEnabled: isHavenServiceWorkerRegistrationEnabled(),
    webPushSyncEnabled: isHavenWebPushSyncEnabled(),
    vapidPublicKeyConfigured: Boolean(getConfiguredVapidPublicKey()),
    notificationPermission: permission,
    serviceWorkerReady: Boolean(registration),
    browserSubscriptionActive: Boolean(browserSubscription || storedEndpoint),
    browserSubscriptionEndpoint: endpoint,
    backendSubscriptionCount,
    installationId,
  };
};

export const requestHavenWebPushPermissionAndSync = async (): Promise<NotificationPermission | null> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  enableHavenWebPushSync();

  if (Notification.permission === 'granted') {
    await enqueueSync();
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await enqueueSync();
  }
  return result;
};

export const runHavenWebPushWorkerOnce = async (
  input?: {
    maxJobs?: number;
    mode?: 'manual' | 'shadow' | 'wakeup';
  }
): Promise<HavenWebPushWorkerRunStats> => {
  const requested = typeof input?.maxJobs === 'number' ? input.maxJobs : 10;
  const maxJobs = Math.min(50, Math.max(1, Math.trunc(requested)));
  const mode =
    input?.mode === 'shadow' || input?.mode === 'wakeup' ? input.mode : 'manual';
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || 'Failed to read current session for web push worker invoke.');
  }
  if (!session?.access_token) {
    throw new Error('You must be signed in to run the web push worker manually.');
  }

  const { data, error } = await supabase.functions.invoke('web-push-worker', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      mode,
      maxJobs,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to invoke web-push-worker.');
  }

  return (data && typeof data === 'object' ? data : { ok: true }) as HavenWebPushWorkerRunStats;
};

const attachAuthStateSyncListener = (): void => {
  if (authSubscription) return;

  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    if (!activeServiceWorkerRegistration) return;
    if (!session?.user?.id) return;

    if (
      event === 'INITIAL_SESSION' ||
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED'
    ) {
      void enqueueSync();
    }
  });

  authSubscription = subscription.data.subscription;
};

const resolveRegistrationFromResult = async (
  input?: RegisterServiceWorkerResult | ServiceWorkerRegistration | null
): Promise<ServiceWorkerRegistration | null> => {
  if (input && 'scope' in input) {
    return input;
  }

  if (input && input.attempted && input.registered && input.registration) {
    return input.registration;
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration) {
      return existingRegistration;
    }
  } catch {
    // Ignore getRegistration errors and try a short ready fallback next.
  }

  try {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 250);
    });
    return (await Promise.race([navigator.serviceWorker.ready, timeout])) as ServiceWorkerRegistration | null;
  } catch {
    return null;
  }
};

export const startHavenWebPushClient = async (
  input?: RegisterServiceWorkerResult | ServiceWorkerRegistration | null
): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (webPushClientStarted) return;
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return;

  const registration = await resolveRegistrationFromResult(input);
  if (!registration) return;

  activeServiceWorkerRegistration = registration;
  webPushClientStarted = true;

  attachAuthStateSyncListener();
  await enqueueSync();
};
