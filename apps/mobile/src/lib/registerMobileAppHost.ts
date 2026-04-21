import * as Linking from "expo-linking";
import { setAppHost, type AppHost } from "@shared/platform/appHost";

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
  };
  setAppHost(host);
}
