import type {
  AppSettings,
  NotificationAudioSettings,
  SaveFileFromUrlResult,
  UpdaterStatus,
  VoicePopoutControlAction,
  VoicePopoutState,
  VoiceSettings,
} from '@platform/desktop/types';
import type { NotificationDeliveryTraceRecord } from '@shared/lib/backend/types';
import type {
  WebPushDispatchQueueHealthDiagnostics,
  WebPushDispatchWakeupDiagnostics,
} from '@shared/lib/backend/types';
import type { WebPushRouteDiagnosticsSnapshot } from '@shared/lib/notifications/webPushDiagnostics';
import type { RegisterServiceWorkerResult } from '@platform/runtime/web/registerServiceWorker';
import type { HavenNotificationDevMode, HavenWebPushClientStatus } from '@platform/runtime/web/webPushClient';

export type PlatformRuntimeKind = 'electron-desktop' | 'web' | 'mobile-native';

export type PlatformNotificationRoutingSignals = {
  pushSupported: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  swRegistered: boolean;
  pushSubscriptionActive: boolean;
  pushSyncEnabled: boolean;
  serviceWorkerRegistrationEnabled: boolean;
};

export type PlatformNotificationOpenEvent = {
  source: 'browser_push' | 'native_push';
  targetUrl?: string | null;
  payload?: unknown;
};

export type PlatformKeyboardState = {
  hasFocusedTextEntry: boolean;
  keyboardInsetPx: number;
  keyboardOpen: boolean;
  layoutViewportHeightPx: number;
  scale: number;
  shellHeightPx: number;
  visualViewportHeightPx: number;
  visualViewportOffsetTopPx: number;
};

export interface PlatformKeyboardRuntime {
  getState(): PlatformKeyboardState;
  subscribe(listener: (state: PlatformKeyboardState) => void): () => void;
}

export interface PlatformBrowserPushRuntime {
  registerServiceWorker(): Promise<RegisterServiceWorkerResult>;
  start(serviceWorkerResult: RegisterServiceWorkerResult): Promise<void>;
  getStatus(): Promise<HavenWebPushClientStatus>;
  enableSync(): void;
  disableSync(): void;
  requestPermissionAndSync(): Promise<NotificationPermission>;
  removeSubscription(): Promise<boolean>;
  getRouteDiagnostics(): Promise<{
    mode: HavenNotificationDevMode;
    decision: {
      routeMode: string;
      reasonCodes: string[];
    };
    localTraces: NotificationDeliveryTraceRecord[];
  }>;
  getRoutingSignalsSync(): PlatformNotificationRoutingSignals;
  setDevMode(mode: HavenNotificationDevMode): void;
  setSimulationFocus(hasFocus: boolean): void;
  clearSimulation(): void;
  recordSimulationTrace(): unknown;
  clearDiagnostics(): void;
  showServiceWorkerTestNotification(input: {
    title: string;
    body: string;
    targetUrl: string;
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  simulateServiceWorkerNotificationClick(input: {
    targetUrl: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  runWorkerOnce(input?: { maxJobs?: number; mode?: 'default' | 'shadow' | 'wakeup' }): Promise<unknown>;
}

export interface PlatformNativePushRuntime {
  initialize(): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  getToken(): Promise<string | null>;
}

export interface PlatformNotificationsRuntime {
  transport: 'browser' | 'native' | 'none';
  getRoutingSignalsSync(): PlatformNotificationRoutingSignals;
  subscribeOpen(listener: (event: PlatformNotificationOpenEvent) => void): () => void;
  browserPush: PlatformBrowserPushRuntime | null;
  nativePush: PlatformNativePushRuntime | null;
  getDiagnosticsSnapshot?: () => Promise<{
    routeDiagnostics: WebPushRouteDiagnosticsSnapshot | null;
    backendTraces: NotificationDeliveryTraceRecord[];
    queueHealthDiagnostics: WebPushDispatchQueueHealthDiagnostics | null;
    wakeupDiagnostics: WebPushDispatchWakeupDiagnostics | null;
  }>;
}

export interface PlatformFilesRuntime {
  openExternalUrl(url: string): Promise<void> | void;
  saveFileFromUrl(input: {
    url: string;
    suggestedName?: string | null;
  }): Promise<SaveFileFromUrlResult | null>;
}

export interface PlatformLinksRuntime {
  getAuthConfirmRedirectUrl(): string;
  getInviteBaseUrl(): string;
  getCurrentUrl(): string | null;
  subscribeIncoming(listener: (url: string) => void): () => void;
  consumePendingUrl(): Promise<string | null>;
}

export interface DesktopRuntimeClient {
  isAvailable(): boolean;
  getAppSettings(): Promise<AppSettings>;
  setAutoUpdateEnabled(enabled: boolean): Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }>;
  setNotificationAudioSettings(input: NotificationAudioSettings): Promise<{
    settings: AppSettings;
  }>;
  setVoiceSettings(input: VoiceSettings): Promise<{
    settings: AppSettings;
  }>;
  getUpdaterStatus(): Promise<UpdaterStatus>;
  checkForUpdates(): Promise<UpdaterStatus>;
  saveFileFromUrl(input: {
    url: string;
    suggestedName?: string | null;
  }): Promise<SaveFileFromUrlResult>;
  consumeNextProtocolUrl(): Promise<string | null>;
  openVoicePopout(): Promise<{ opened: boolean }>;
  closeVoicePopout(): Promise<{ closed: boolean }>;
  syncVoicePopoutState(state: VoicePopoutState): Promise<void>;
  dispatchVoicePopoutControlAction(action: VoicePopoutControlAction): Promise<void>;
  onProtocolUrl(listener: (url: string) => void): () => void;
  onVoicePopoutState(listener: (state: VoicePopoutState) => void): () => void;
  onVoicePopoutControlAction(listener: (action: VoicePopoutControlAction) => void): () => void;
}

export interface PlatformRuntime {
  kind: PlatformRuntimeKind;
  capabilities: {
    voicePopout: boolean;
    browserPush: boolean;
    nativePush: boolean;
    nativeKeyboard: boolean;
    fileSave: boolean;
    universalLinks: boolean;
  };
  links: PlatformLinksRuntime;
  notifications: PlatformNotificationsRuntime;
  files: PlatformFilesRuntime;
  keyboard: PlatformKeyboardRuntime | null;
  desktop: DesktopRuntimeClient | null;
}
