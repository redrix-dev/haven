import "react-native-gesture-handler";

import "./global.css";

import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { initializeHavenDataFromClient } from "@shared/lib/bootstrap/initializeHavenDataFromClient";
import { registerMobileAppHost } from "@/lib/registerMobileAppHost";
import { getMobileSupabase } from "@/supabase/getMobileSupabase";
import { RootNavigator } from "./src/navigation/RootNavigator";

registerMobileAppHost();

const mobileExtra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;
const mobileClient = getMobileSupabase();
initializeHavenDataFromClient(mobileClient, {
  supabaseUrl: mobileExtra?.supabaseUrl?.trim() ?? "",
  supabaseAnonKey: mobileExtra?.supabaseAnonKey?.trim() ?? "",
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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
