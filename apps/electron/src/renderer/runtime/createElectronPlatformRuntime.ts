import { desktopClient } from '@platform/desktop/client';
import type { PlatformRuntime } from '@platform/runtime/types';

const getBrowserOrigin = (): string | null => {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !origin || origin === 'null') {
    return null;
  }
  return origin;
};

export function createElectronPlatformRuntime(): PlatformRuntime {
  return {
    kind: 'electron-desktop',
    capabilities: {
      voicePopout: true,
      browserPush: false,
      nativePush: false,
      nativeKeyboard: false,
      fileSave: true,
      universalLinks: false,
    },
    links: {
      getAuthConfirmRedirectUrl: () => 'haven://auth/confirm',
      getInviteBaseUrl: () => 'haven://invite/',
      getCurrentUrl: () => {
        const origin = getBrowserOrigin();
        return origin ? window.location.href : null;
      },
      subscribeIncoming: (listener) => desktopClient.onProtocolUrl(listener),
      consumePendingUrl: () => desktopClient.consumeNextProtocolUrl(),
    },
    notifications: {
      transport: 'none',
      getRoutingSignalsSync: () => ({
        pushSupported: false,
        pushPermission: 'unsupported',
        swRegistered: false,
        pushSubscriptionActive: false,
        pushSyncEnabled: false,
        serviceWorkerRegistrationEnabled: false,
      }),
      subscribeOpen: () => () => {},
      browserPush: null,
      nativePush: null,
    },
    files: {
      openExternalUrl: (url) => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
      saveFileFromUrl: (input) => desktopClient.saveFileFromUrl(input),
    },
    keyboard: null,
    desktop: desktopClient,
  };
}
