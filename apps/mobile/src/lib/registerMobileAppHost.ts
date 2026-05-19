import * as Linking from "expo-linking";
import { setAppHost, type AppHost } from "@shared/infrastructure/platform/appHost";

/**
 * Imperative navigation delegate provided by the active navigator.
 * Wired by `MainNavigator` once the React Navigation container is ready.
 * Defined here so the AppHost can reference it without importing navigation modules.
 */
export type MobileNavigationDelegate = {
  navigateToCommunity: (serverId: string, channelId?: string | null) => void;
  navigateToDm: (conversationId: string) => void;
};

let activeNavigationDelegate: MobileNavigationDelegate | null = null;

export function setMobileNavigationDelegate(
  delegate: MobileNavigationDelegate | null,
): void {
  activeNavigationDelegate = delegate;
}

/**
 * Replaces web-default `window.open` host behavior before shared auth/navigation runs.
 * Extend with file downloads (expo-file-system / sharing) when needed.
 */
export function registerMobileAppHost(): void {
  const host: AppHost = {
    isDesktopApp: () => false,
    browserRuntime: {
      getVisibilityState: () => null,
      addVisibilityChangeListener: () => () => {},
      addFocusListener: () => () => {},
      addBlurListener: () => () => {},
      getLocationHref: () => null,
      getLocationOrigin: () => null,
      replaceHistoryUrl: () => {},
      getDocumentTitle: () => "",
      storageGetItem: () => null,
      storageSetItem: () => {},
      storageRemoveItem: () => {},
    },
    openExternalUrl: async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        // Avoid canOpenURL: iOS may require LSApplicationQueriesSchemes entries.
      }
    },
    saveFileFromUrl: async () => ({ saved: false, filePath: null }),
    navigateToCommunity: (serverId, channelId) => {
      if (!activeNavigationDelegate) return;
      activeNavigationDelegate.navigateToCommunity(serverId, channelId ?? null);
    },
    navigateToDm: (conversationId) => {
      if (!activeNavigationDelegate) return;
      activeNavigationDelegate.navigateToDm(conversationId);
    },
  };
  setAppHost(host);
}
