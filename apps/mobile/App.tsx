import "react-native-gesture-handler";

import "./global.css";

import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initializeHavenDataFromClient } from "@shared/lib/bootstrap/initializeHavenDataFromClient";
import { registerMobileAppHost } from "@/lib/registerMobileAppHost";
import { getMobileSupabase, resolveMobileSupabaseConfig } from "@/supabase/getMobileSupabase";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { buildNativeThemeVars } from "./src/lib/theme";
import { getTheme } from '@shared/themes';

registerMobileAppHost();

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
const themeVars = buildNativeThemeVars(getTheme('halloween').tokens);
export default function App() {
  return (
    <GestureHandlerRootView style={[{ flex: 1 }, themeVars ]}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
