import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { getMobileSupabase } from "@/supabase/getMobileSupabase";

const INSTALLATION_ID_KEY = "haven:mobilePushInstallationId";
const LAST_EXPO_TOKEN_KEY = "haven:lastExpoPushToken";

async function getOrCreateInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing?.trim()) return existing.trim();
  const created = `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

function openNotificationDeepLink(data: Record<string, unknown> | undefined): void {
  const url = data && typeof data.url === "string" ? data.url.trim() : "";
  if (!url) return;
  const path = url.startsWith("/") ? url : `/${url}`;
  void Linking.openURL(`haven:${path}`).catch(() => {
    /* best-effort until navigation is wired to notification payloads */
  });
}

/**
 * Registers the device Expo push token with Supabase after sign-in, removes it on sign-out,
 * and attaches lightweight notification response handlers (deep link via `haven:` scheme).
 */
export function useMobileExpoPushRegistration(session: Session | null | undefined): void {
  const registeringRef = useRef(false);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationDeepLink(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      openNotificationDeepLink(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
    });
  }, []);

  useEffect(() => {
    if (session !== null) return undefined;

    let cancelled = false;
    void (async () => {
      const stored = await AsyncStorage.getItem(LAST_EXPO_TOKEN_KEY);
      if (!stored?.trim() || cancelled) return;
      try {
        const supabase = getMobileSupabase();
        await supabase.rpc("delete_my_expo_push_subscription" as never, {
          p_expo_push_token: stored.trim(),
        } as never);
      } catch (error) {
        console.warn("[mobile push] Failed to delete expo push token on sign-out.", error);
      }
      await AsyncStorage.removeItem(LAST_EXPO_TOKEN_KEY);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    let cancelled = false;

    const register = async () => {
      if (registeringRef.current) return;
      registeringRef.current = true;
      try {
        if (!Device.isDevice) {
          return;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        // `expo-notifications` types extend `PermissionResponse` from `expo-modules-core`; the
        // mobile package may not resolve that peer for `tsc`, so we narrow explicitly.
        const existing = (await Notifications.getPermissionsAsync()) as {
          status: "granted" | "denied" | "undetermined";
        };
        let canNotify = existing.status === "granted";
        if (!canNotify) {
          const ask = (await Notifications.requestPermissionsAsync()) as {
            status: "granted" | "denied" | "undetermined";
          };
          canNotify = ask.status === "granted";
        }
        if (!canNotify) {
          return;
        }

        const projectId =
          (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
            ?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
        if (!projectId || typeof projectId !== "string") {
          console.warn("[mobile push] Missing EAS projectId in app config; cannot obtain Expo push token.");
          return;
        }

        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        const expoPushToken = tokenResult.data?.trim();
        if (!expoPushToken || cancelled) return;

        const installationId = await getOrCreateInstallationId();
        const platform =
          Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";

        const supabase = getMobileSupabase();
        const { error } = await supabase.rpc("upsert_my_expo_push_subscription" as never, {
          p_expo_push_token: expoPushToken,
          p_platform: platform,
          p_installation_id: installationId,
          p_metadata: { source: "haven-mobile" },
        } as never);

        if (error) {
          console.warn("[mobile push] upsert_my_expo_push_subscription failed:", error.message);
          return;
        }

        await AsyncStorage.setItem(LAST_EXPO_TOKEN_KEY, expoPushToken);
      } catch (error) {
        console.warn("[mobile push] Registration error:", error);
      } finally {
        registeringRef.current = false;
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);
}
