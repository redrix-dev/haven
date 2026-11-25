import * as Linking from "expo-linking";
import { createMMKV, type MMKV } from "react-native-mmkv";
import {
  setAppHost,
  type AppHost,
} from "@shared/infrastructure/platform/appHost";

let runtimeStorage: MMKV | null = null;

function getRuntimeStorage(): MMKV {
  if (!runtimeStorage) {
    runtimeStorage = createMMKV({ id: "haven-mobile-runtime-storage" });
  }
  return runtimeStorage;
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
      storageGetItem: (key) => getRuntimeStorage().getString(key) ?? null,
      storageSetItem: (key, value) => getRuntimeStorage().set(key, value),
      storageRemoveItem: (key) => getRuntimeStorage().remove(key),
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
