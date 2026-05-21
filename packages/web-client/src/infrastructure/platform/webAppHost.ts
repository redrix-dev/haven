import { setAppHost, type AppHost } from "@shared/infrastructure/platform/appHost";

const buildCommunityUrlPath = (
  serverId: string,
  channelId?: string | null,
): string => (channelId ? `/c/${serverId}/${channelId}` : `/c/${serverId}`);

const buildDmUrlPath = (conversationId: string): string =>
  `/dm/${conversationId}`;

const navigateWebTo = (path: string) => {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  try {
    window.history.pushState({}, document.title, path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.location.assign(path);
  }
};

export const webAppHost: AppHost = {
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
  navigateToCommunity: (serverId, channelId) => {
    navigateWebTo(buildCommunityUrlPath(serverId, channelId));
  },
  navigateToDm: (conversationId) => {
    navigateWebTo(buildDmUrlPath(conversationId));
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

/**
 * Register the web (browser) AppHost implementation. Call once at app startup
 * before any platform-aware code runs.
 */
export function registerWebAppHost(): void {
  setAppHost(webAppHost);
}
