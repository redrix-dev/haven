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
  // Minimal VoiceRuntimeBridge: device enumeration only.
  // LiveKit handles media capture, VAD, and PTT directly via browser APIs.
  voiceRuntime: {
    enumerateDevices: async () => {
      if (typeof navigator === "undefined") return [];
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      return navigator.mediaDevices.enumerateDevices();
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
  },
};

/**
 * Register the web (browser) AppHost implementation. Call once at app startup
 * before any platform-aware code runs.
 */
export function registerWebAppHost(): void {
  setAppHost(webAppHost);
}
