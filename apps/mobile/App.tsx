import "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import "./global.css";

import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initializeHavenDataFromClient } from "@shared/lib/bootstrap/initializeHavenDataFromClient"
import { registerMobileAppHost } from "@/lib/registerMobileAppHost";
import {
  getMobileSupabase,
  resolveMobileSupabaseConfig,
} from "@/supabase/getMobileSupabase";
import { useLayoutEffect, useState } from "react";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { applyMobileTheme } from "./src/lib/theme";
import { loadPersistedThemeId } from "./src/storage/mobileThemePreferenceStorage";
import { useMobileThemePreferenceStore } from "./src/stores/mobileThemePreferenceStore";
import { bootstrapDataCacheDebug } from "./src/debug/bootstrapDataCacheDebug";
import { MobileDevToolsOverlay } from "./src/dev/MobileDevToolsOverlay";

registerMobileAppHost();
bootstrapDataCacheDebug();

const mobileClient = getMobileSupabase();
const mobileConfig = resolveMobileSupabaseConfig();
initializeHavenDataFromClient(mobileClient, {
  supabaseUrl: mobileConfig.supabaseUrl,
  supabaseAnonKey: mobileConfig.supabaseAnonKey,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
function App() {
  const selectedThemeId = useMobileThemePreferenceStore(
    (s) => s.selectedThemeId,
  );
  const [themeStorageReady, setThemeStorageReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await loadPersistedThemeId();
        if (!cancelled && raw) {
          useMobileThemePreferenceStore.getState().setSelectedThemeId(raw);
        }
      } finally {
        if (!cancelled) setThemeStorageReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!themeStorageReady) return;
    applyMobileTheme(selectedThemeId);
  }, [selectedThemeId, themeStorageReady]);

  if (!themeStorageReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <RootNavigator />
          {__DEV__ ? <MobileDevToolsOverlay /> : null}
          <StatusBar style="light" />
          <PortalHost />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
