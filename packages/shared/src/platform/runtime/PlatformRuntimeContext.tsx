import React from 'react';
import type { PlatformNotificationRoutingSignals, PlatformRuntime } from '@platform/runtime/types';

const getBrowserOrigin = (): string | null => {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !origin || origin === 'null') {
    return null;
  }
  return origin;
};

const getFallbackInviteBaseUrl = (): string => {
  const origin = getBrowserOrigin();
  if (!origin) return 'haven://invite/';
  return new URL('/invite/', origin).toString();
};

const getFallbackAuthConfirmRedirectUrl = (): string => {
  const origin = getBrowserOrigin();
  if (!origin) return 'haven://auth/confirm';
  return new URL('/auth/confirm', origin).toString();
};

const EMPTY_NOTIFICATION_SIGNALS: PlatformNotificationRoutingSignals = {
  pushSupported: false,
  pushPermission: 'unsupported',
  swRegistered: false,
  pushSubscriptionActive: false,
  pushSyncEnabled: false,
  serviceWorkerRegistrationEnabled: false,
};

const fallbackRuntime: PlatformRuntime = {
  kind: 'web',
  capabilities: {
    voicePopout: false,
    browserPush: false,
    nativePush: false,
    nativeKeyboard: false,
    fileSave: false,
    universalLinks: false,
  },
  links: {
    getAuthConfirmRedirectUrl: getFallbackAuthConfirmRedirectUrl,
    getInviteBaseUrl: getFallbackInviteBaseUrl,
    getCurrentUrl: () => (typeof window === 'undefined' ? null : window.location.href),
    subscribeIncoming: () => () => {},
    consumePendingUrl: async () => null,
  },
  notifications: {
    transport: 'none',
    getRoutingSignalsSync: () => EMPTY_NOTIFICATION_SIGNALS,
    subscribeOpen: () => () => {},
    browserPush: null,
    nativePush: null,
  },
  files: {
    openExternalUrl: (url: string) => {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    saveFileFromUrl: async (input) => {
      if (typeof window !== 'undefined') {
        window.open(input.url, '_blank', 'noopener,noreferrer');
      }
      return null;
    },
  },
  keyboard: null,
  desktop: null,
};

const PlatformRuntimeContext = React.createContext<PlatformRuntime>(fallbackRuntime);

let currentPlatformRuntime: PlatformRuntime = fallbackRuntime;

export function PlatformRuntimeProvider({
  children,
  runtime,
}: {
  children: React.ReactNode;
  runtime: PlatformRuntime;
}) {
  currentPlatformRuntime = runtime;

  React.useEffect(() => {
    currentPlatformRuntime = runtime;
    return () => {
      currentPlatformRuntime = fallbackRuntime;
    };
  }, [runtime]);

  return (
    <PlatformRuntimeContext.Provider value={runtime}>
      {children}
    </PlatformRuntimeContext.Provider>
  );
}

export function usePlatformRuntime(): PlatformRuntime {
  return React.useContext(PlatformRuntimeContext);
}

export function getPlatformRuntime(): PlatformRuntime {
  return currentPlatformRuntime;
}
