import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications } from '@capacitor/push-notifications';
import type {
  PlatformNotificationRoutingSignals,
  PlatformKeyboardState,
  PlatformNotificationOpenEvent,
  PlatformRuntime,
} from '@platform/runtime/types';

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEBCLIENT_URL?.trim() ||
  process.env.VITE_PUBLIC_WEBCLIENT_URL?.trim() ||
  'https://haven.invalid';

const KEYBOARD_OPEN_THRESHOLD_PX = 80;

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isKeyboardTextEntryElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }
  return false;
}

function buildUrl(pathname: string): string {
  return new URL(pathname, PUBLIC_WEB_BASE_URL).toString();
}

function mapNativePermission(
  receive: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | string | undefined
): NotificationPermission | 'unsupported' {
  switch (receive) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'prompt':
    case 'prompt-with-rationale':
      return 'default';
    default:
      return 'unsupported';
  }
}

function createKeyboardRuntime() {
  let lastKeyboardHeight = 0;
  const listeners = new Set<(state: PlatformKeyboardState) => void>();

  const buildState = (): PlatformKeyboardState => {
    const layoutViewportHeightPx =
      typeof window === 'undefined' ? 0 : window.innerHeight;
    const keyboardInsetPx = Math.max(0, lastKeyboardHeight);
    const hasFocusedTextEntry =
      typeof document !== 'undefined' &&
      isKeyboardTextEntryElement(document.activeElement);
    const keyboardOpen =
      hasFocusedTextEntry && keyboardInsetPx >= KEYBOARD_OPEN_THRESHOLD_PX;
    const shellHeightPx = Math.max(0, layoutViewportHeightPx - (keyboardOpen ? keyboardInsetPx : 0));

    return {
      hasFocusedTextEntry,
      keyboardInsetPx: keyboardOpen ? keyboardInsetPx : 0,
      keyboardOpen,
      layoutViewportHeightPx,
      scale: 1,
      shellHeightPx,
      visualViewportHeightPx: shellHeightPx,
      visualViewportOffsetTopPx: 0,
    };
  };

  const emit = () => {
    const next = buildState();
    listeners.forEach((listener) => listener(next));
  };

  Keyboard.addListener('keyboardWillShow', (info) => {
    lastKeyboardHeight = info.keyboardHeight ?? 0;
    emit();
  });
  Keyboard.addListener('keyboardDidShow', (info) => {
    lastKeyboardHeight = info.keyboardHeight ?? lastKeyboardHeight;
    emit();
  });
  Keyboard.addListener('keyboardWillHide', () => {
    lastKeyboardHeight = 0;
    emit();
  });
  Keyboard.addListener('keyboardDidHide', () => {
    lastKeyboardHeight = 0;
    emit();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', emit);
    document.addEventListener('focusin', emit);
    document.addEventListener('focusout', emit);
  }

  return {
    getState: buildState,
    subscribe(listener: (state: PlatformKeyboardState) => void) {
      listeners.add(listener);
      listener(buildState());
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createNotificationOpenSubscriber(
  listener: (event: PlatformNotificationOpenEvent) => void
): () => void {
  const handle = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      const data = action.notification.data ?? {};
      const targetUrl =
        (typeof data.targetUrl === 'string' && data.targetUrl) ||
        (typeof data.url === 'string' && data.url) ||
        (typeof data.path === 'string' && data.path) ||
        null;

      listener({
        source: 'native_push',
        targetUrl,
        payload: data,
      });
    }
  );

  return () => {
    void handle.then((subscription) => subscription.remove());
  };
}

export function createMobilePlatformRuntime(): PlatformRuntime {
  const isNativePlatform = Capacitor.isNativePlatform();
  const keyboard = isNativePlatform ? createKeyboardRuntime() : null;
  let latestToken: string | null = null;
  let latestPermission: NotificationPermission | 'unsupported' = 'default';
  const pendingLaunchUrls: string[] = [];

  const getRoutingSignalsSync = (): PlatformNotificationRoutingSignals => ({
    pushSupported: isNativePlatform,
    pushPermission: isNativePlatform ? latestPermission : 'unsupported',
    swRegistered: false,
    pushSubscriptionActive: isNativePlatform && Boolean(latestToken),
    pushSyncEnabled: isNativePlatform && latestPermission === 'granted',
    serviceWorkerRegistrationEnabled: false,
  });

  if (isNativePlatform) {
    void App.getLaunchUrl()
      .then((result) => {
        const launchUrl = result?.url?.trim();
        if (launchUrl) {
          pendingLaunchUrls.push(launchUrl);
        }
      })
      .catch(() => {});

    void PushNotifications.checkPermissions()
      .then((permissions) => {
        latestPermission = mapNativePermission(permissions.receive);
      })
      .catch(() => {
        latestPermission = 'unsupported';
      });

    void PushNotifications.addListener('registration', (token) => {
      latestToken = token.value;
    });
    void PushNotifications.addListener('registrationError', () => {
      latestToken = null;
    });
  }

  return {
    kind: 'mobile-native',
    capabilities: {
      voicePopout: false,
      browserPush: false,
      nativePush: isNativePlatform,
      nativeKeyboard: isNativePlatform,
      fileSave: false,
      universalLinks: isNativePlatform,
    },
    links: {
      getAuthConfirmRedirectUrl: () => buildUrl('/auth/confirm'),
      getInviteBaseUrl: () => buildUrl('/invite/'),
      getCurrentUrl: () =>
        !isNativePlatform && typeof window !== 'undefined' ? window.location.href : null,
      subscribeIncoming: (listener) => {
        if (!isNativePlatform) {
          return () => {};
        }
        const handle = App.addListener('appUrlOpen', (event) => {
          if (event.url) {
            listener(event.url);
          }
        });
        return () => {
          void handle.then((subscription) => subscription.remove());
        };
      },
      consumePendingUrl: async () => pendingLaunchUrls.shift() ?? null,
    },
    notifications: {
      transport: isNativePlatform ? 'native' : 'none',
      getRoutingSignalsSync,
      subscribeOpen: isNativePlatform ? createNotificationOpenSubscriber : () => () => {},
      browserPush: null,
      nativePush: isNativePlatform
        ? {
        initialize: async () => {
          const permissions = await PushNotifications.checkPermissions();
          latestPermission = mapNativePermission(permissions.receive);
          if (permissions.receive !== 'granted') {
            const nextPermissions = await PushNotifications.requestPermissions();
            latestPermission = mapNativePermission(nextPermissions.receive);
          }
          await PushNotifications.register();
        },
        register: async () => {
          const permissions = await PushNotifications.checkPermissions();
          latestPermission = mapNativePermission(permissions.receive);
          if (permissions.receive !== 'granted') {
            const nextPermissions = await PushNotifications.requestPermissions();
            latestPermission = mapNativePermission(nextPermissions.receive);
          }
          await PushNotifications.register();
        },
        unregister: async () => {
          latestToken = null;
          const runtime = PushNotifications as unknown as {
            unregister?: () => Promise<void>;
          };
          if (typeof runtime.unregister === 'function') {
            await runtime.unregister();
          }
        },
        getToken: async () => latestToken,
          }
        : null,
    },
    files: {
      openExternalUrl: async (url) => {
        await Browser.open({ url });
      },
      saveFileFromUrl: async ({ url }) => {
        await Browser.open({ url });
        return null;
      },
    },
    keyboard,
    desktop: null,
  };
}
