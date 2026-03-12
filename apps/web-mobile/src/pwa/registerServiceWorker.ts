export type WebPwaCapabilities = {
  secureContext: boolean;
  supportsServiceWorker: boolean;
  supportsNotifications: boolean;
  supportsPushManager: boolean;
  isStandaloneDisplayMode: boolean;
};

export type RegisterServiceWorkerResult =
  | { attempted: false; reason: string; capabilities: WebPwaCapabilities | null }
  | {
      attempted: true;
      registered: boolean;
      reason: string;
      registration?: ServiceWorkerRegistration;
      capabilities: WebPwaCapabilities;
    };

// Dev-only override. By default service worker auto-registration is enabled.
export const SERVICE_WORKER_ENABLE_STORAGE_KEY = 'haven:pwa:service-worker-enabled';
const SERVICE_WORKER_SCRIPT_PATH = '/haven-sw.js';

export const getWebPwaCapabilities = (): WebPwaCapabilities | null => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }

  const displayModeStandalone = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return {
    secureContext: window.isSecureContext || window.location.hostname === 'localhost',
    supportsServiceWorker: 'serviceWorker' in navigator,
    supportsNotifications: 'Notification' in window,
    supportsPushManager: 'PushManager' in window,
    isStandaloneDisplayMode: displayModeStandalone || iosStandalone,
  };
};

export const isHavenServiceWorkerRegistrationEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage.getItem(SERVICE_WORKER_ENABLE_STORAGE_KEY);
    // Legacy behavior used explicit "1" enable. Reset baseline flips to enabled-by-default,
    // with an optional local "0" dev override to disable auto-registration temporarily.
    return stored !== '0';
  } catch {
    return true;
  }
};

export const setHavenServiceWorkerRegistrationEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;

  try {
    if (enabled) {
      window.localStorage.setItem(SERVICE_WORKER_ENABLE_STORAGE_KEY, '1');
    } else {
      window.localStorage.setItem(SERVICE_WORKER_ENABLE_STORAGE_KEY, '0');
    }
  } catch {
    // Ignore storage failures in restricted/private contexts.
  }
};

export const registerHavenServiceWorker = async (): Promise<RegisterServiceWorkerResult> => {
  const capabilities = getWebPwaCapabilities();
  if (!capabilities) {
    return {
      attempted: false,
      reason: 'No browser window available.',
      capabilities: null,
    };
  }

  if (!isHavenServiceWorkerRegistrationEnabled()) {
    return {
      attempted: false,
      reason: `Service worker registration disabled by local override (${SERVICE_WORKER_ENABLE_STORAGE_KEY}=0).`,
      capabilities,
    };
  }

  if (!capabilities.secureContext) {
    return {
      attempted: false,
      reason: 'Service workers require a secure context (HTTPS or localhost).',
      capabilities,
    };
  }

  if (!capabilities.supportsServiceWorker) {
    return {
      attempted: false,
      reason: 'Browser does not support service workers.',
      capabilities,
    };
  }

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_PATH, {
      scope: '/',
    });
    return {
      attempted: true,
      registered: true,
      reason: 'Service worker registered.',
      registration,
      capabilities,
    };
  } catch (error) {
    console.warn('Failed to register Haven service worker skeleton:', error);
    return {
      attempted: true,
      registered: false,
      reason: error instanceof Error ? error.message : String(error),
      capabilities,
    };
  }
};
