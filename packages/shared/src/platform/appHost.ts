import type {
  NotificationAudioSettings,
  VoiceSettings,
  AppSettings,
} from "@shared/app/types/settings";
import type { UpdaterStatus, SaveFileFromUrlResult, VoicePopoutControlAction, VoicePopoutState } from "@shared/platform/desktop/types";

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

export type AppHost = {
  isDesktopApp: () => boolean;
  openExternalUrl: (url: string) => Promise<void>;
  saveFileFromUrl: (input: {
    url: string;
    suggestedName: string;
  }) => Promise<SaveFileFromUrlResult>;
  desktopSettings?: DesktopSettingsBridge;
  desktopAuth?: DesktopAuthBridge;
  voicePopout?: VoicePopoutBridge;
  windowChrome?: WindowChromeBridge;
  browserRuntime?: BrowserRuntimeBridge;
  voiceRuntime?: VoiceRuntimeBridge;
};

const defaultWebHost: AppHost = {
  isDesktopApp: () => false,
  openExternalUrl: async (url: string) => {
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  },
  saveFileFromUrl: async ({ url }) => {
    if (typeof window === "undefined") {
      return { saved: false, filePath: null };
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return { saved: false, filePath: null };
  },
  browserRuntime: {
    getVisibilityState: () => {
      if (typeof document === "undefined") return null;
      return document.visibilityState === "hidden" ? "hidden" : "visible";
    },
    addVisibilityChangeListener: (listener: () => void) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
      };
    },
    addFocusListener: (listener: () => void) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("focus", listener);
      return () => {
        window.removeEventListener("focus", listener);
      };
    },
    addBlurListener: (listener: () => void) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("blur", listener);
      return () => {
        window.removeEventListener("blur", listener);
      };
    },
    getLocationHref: () => {
      if (typeof window === "undefined") return null;
      return window.location.href;
    },
    getLocationOrigin: () => {
      if (typeof window === "undefined") return null;
      const origin = window.location?.origin;
      if (typeof origin !== "string" || !origin || origin === "null") {
        return null;
      }
      return origin;
    },
    replaceHistoryUrl: (nextPath: string) => {
      if (typeof window === "undefined") return;
      try {
        window.history.replaceState({}, document.title, nextPath);
      } catch {
        // no-op
      }
    },
    getDocumentTitle: () => {
      if (typeof document === "undefined") return "";
      return document.title ?? "";
    },
    storageGetItem: (key: string) => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    },
    storageSetItem: (key: string, value: string) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
    },
    storageRemoveItem: (key: string) => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    },
  },
  voiceRuntime: {
    enumerateDevices: async () => {
      if (typeof navigator === "undefined") return [];
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      return navigator.mediaDevices.enumerateDevices();
    },
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media devices are unavailable on this host.");
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    addDeviceChangeListener: (listener: () => void) => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.addEventListener
      ) {
        return () => {};
      }
      navigator.mediaDevices.addEventListener("devicechange", listener);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", listener);
      };
    },
    createAudioContext: () => {
      if (typeof window === "undefined") return null;
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return null;
      return new AudioContextCtor();
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      if (typeof window === "undefined") return -1;
      return window.requestAnimationFrame(callback);
    },
    cancelAnimationFrame: (handle: number) => {
      if (typeof window === "undefined") return;
      window.cancelAnimationFrame(handle);
    },
    setTimeout: (callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs),
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    setInterval: (callback: () => void, delayMs: number) =>
      setInterval(callback, delayMs),
    clearInterval: (handle: ReturnType<typeof setInterval>) =>
      clearInterval(handle),
    addKeyDownListener: (
      listener: (event: KeyboardEvent) => void,
      capture = false,
    ) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("keydown", listener, capture);
      return () => {
        window.removeEventListener("keydown", listener, capture);
      };
    },
    addKeyUpListener: (listener: (event: KeyboardEvent) => void, capture = false) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("keyup", listener, capture);
      return () => {
        window.removeEventListener("keyup", listener, capture);
      };
    },
  },
};

let currentHost: AppHost = defaultWebHost;

export function setAppHost(host: AppHost): void {
  currentHost = {
    ...defaultWebHost,
    ...host,
    browserRuntime: host.browserRuntime ?? defaultWebHost.browserRuntime,
    voiceRuntime: host.voiceRuntime ?? defaultWebHost.voiceRuntime,
  };
}

export function resetAppHostToWebDefaults(): void {
  currentHost = defaultWebHost;
}

export function getAppHost(): AppHost {
  return currentHost;
}
