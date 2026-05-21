import type {
  NotificationAudioSettings,
  VoiceSettings,
  AppSettings,
} from "@shared/types/settings";
import type { UpdaterStatus, SaveFileFromUrlResult, VoicePopoutControlAction, VoicePopoutState } from "@shared/infrastructure/platform/desktop/types";

export type DesktopSettingsBridge = {
  getAppSettings: () => Promise<AppSettings>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  setAutoUpdateEnabled: (enabled: boolean) => Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }>;
  setNotificationAudioSettings: (
    values: NotificationAudioSettings,
  ) => Promise<{ settings: AppSettings }>;
  setVoiceSettings: (values: VoiceSettings) => Promise<{ settings: AppSettings }>;
  checkForUpdates: () => Promise<UpdaterStatus>;
};

export type DesktopAuthBridge = {
  onProtocolUrl: (listener: (url: string) => void) => () => void;
  consumeNextProtocolUrl: () => Promise<string | null>;
};

export type VoicePopoutBridge = {
  onVoicePopoutState: (listener: (state: VoicePopoutState) => void) => () => void;
  syncVoicePopoutState: (state: VoicePopoutState) => Promise<void>;
  onVoicePopoutControlAction: (
    listener: (action: VoicePopoutControlAction) => void,
  ) => () => void;
  openVoicePopout: () => Promise<void>;
  requestVoicePopoutStateSync: () => Promise<void>;
  dispatchVoicePopoutControlAction: (
    action: VoicePopoutControlAction,
  ) => Promise<void>;
};

export type WindowChromeBridge = {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
};

export type BrowserRuntimeBridge = {
  getVisibilityState: () => "visible" | "hidden" | null;
  addVisibilityChangeListener: (listener: () => void) => () => void;
  addFocusListener: (listener: () => void) => () => void;
  addBlurListener: (listener: () => void) => () => void;
  getLocationHref: () => string | null;
  getLocationOrigin: () => string | null;
  replaceHistoryUrl: (nextPath: string) => void;
  getDocumentTitle: () => string;
  storageGetItem: (key: string) => string | null;
  storageSetItem: (key: string, value: string) => void;
  storageRemoveItem: (key: string) => void;
};

export type VoiceRuntimeBridge = {
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  addDeviceChangeListener: (listener: () => void) => () => void;
  createAudioContext: () => AudioContext | null;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  setInterval: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setInterval>;
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
  addKeyDownListener: (
    listener: (event: KeyboardEvent) => void,
    capture?: boolean,
  ) => () => void;
  addKeyUpListener: (
    listener: (event: KeyboardEvent) => void,
    capture?: boolean,
  ) => () => void;
};

/**
 * Imperative shell navigation requested from non-UI code (notification taps,
 * deep links, access-revoked redirects). The shell implementation owns the
 * actual navigation primitive (React Navigation ref, history.pushState, etc).
 *
 * UI components should NOT call these directly during normal interaction —
 * they exist for external events that cannot reach the router by themselves.
 */
export type ShellNavigationBridge = {
  navigateToCommunity?: (
    serverId: string,
    channelId?: string | null,
  ) => void;
  navigateToDm?: (conversationId: string) => void;
};

export type AppHost = {
  isDesktopApp: () => boolean;
  openExternalUrl: (url: string) => Promise<void>;
  saveFileFromUrl: (input: {
    url: string;
    suggestedName: string;
  }) => Promise<SaveFileFromUrlResult>;
  navigateToCommunity?: ShellNavigationBridge["navigateToCommunity"];
  navigateToDm?: ShellNavigationBridge["navigateToDm"];
  desktopSettings?: DesktopSettingsBridge;
  desktopAuth?: DesktopAuthBridge;
  voicePopout?: VoicePopoutBridge;
  windowChrome?: WindowChromeBridge;
  browserRuntime?: BrowserRuntimeBridge;
  voiceRuntime?: VoiceRuntimeBridge;
};

/**
 * No-op fallback host used before any platform registers.
 * All capabilities return safe empty values — real implementations are
 * provided by each platform's registration call (registerWebAppHost,
 * registerElectronAppHost, registerMobileAppHost).
 */
const noOpHost: AppHost = {
  isDesktopApp: () => false,
  openExternalUrl: async () => {},
  saveFileFromUrl: async () => ({ saved: false, filePath: null }),
};

let currentHost: AppHost = noOpHost;

export function setAppHost(host: AppHost): void {
  currentHost = { ...noOpHost, ...host };
}

export function resetAppHostToWebDefaults(): void {
  currentHost = noOpHost;
}

export function getAppHost(): AppHost {
  return currentHost;
}
