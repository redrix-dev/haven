import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import RNCallKeep from "react-native-callkeep";
import RNVoipPushNotification from "react-native-voip-push-notification";

const LAST_VOIP_TOKEN_KEY = "haven:lastVoipPushToken";

/**
 * Boots minimal VoIP + CallKeep native foundations.
 * This intentionally wires registration/events only; full call UX is implemented later.
 */
const voipFoundationEnabled =
  process.env.EXPO_PUBLIC_HAVEN_VOIP_FOUNDATION !== "0";

/**
 * Set `EXPO_PUBLIC_HAVEN_VOIP_FOUNDATION=0` to skip CallKit / PushKit registration (e.g. while
 * validating an SDK upgrade when native call deps are temporarily broken).
 */
export function useMobileVoipFoundation(
  session: Session | null | undefined,
): void {
  useEffect(() => {
    if (!voipFoundationEnabled) return;
    if (Platform.OS !== "ios") return;

    void Promise.resolve(
      RNCallKeep.setup({
        ios: {
          appName: "Haven",
          supportsVideo: true,
          includesCallsInRecents: false,
          maximumCallGroups: "1",
          maximumCallsPerCallGroup: "1",
        },
        android: {
          alertTitle: "Permissions Required",
          alertDescription: "This app needs phone account permissions",
          cancelButton: "Cancel",
          okButton: "OK",
          additionalPermissions: [],
        },
      }),
    ).catch((error) => {
      console.warn("[voip] CallKeep setup failed.", error);
    });

    RNCallKeep.setAvailable(true);

    function handleVoipRegister(voipToken: string): void {
      if (!voipToken.trim()) return;
      void AsyncStorage.setItem(LAST_VOIP_TOKEN_KEY, voipToken.trim());
    }

    function handleVoipNotification(_payload: unknown): void {
      // Foundation only: keep event subscribed so native ingress is verified.
    }

    function handleAnswerCall(): void {
      // Foundation only: call handling will be connected to voice runtime later.
    }

    function handleEndCall(): void {
      // Foundation only: call handling will be connected to voice runtime later.
    }

    // Register listeners before requesting the token, or PushKit can emit
    // `RNVoipPushRemoteNotificationsRegisteredEvent` before JS subscribes (startup race / warning).
    RNVoipPushNotification.addEventListener("register", handleVoipRegister);
    RNVoipPushNotification.addEventListener("notification", handleVoipNotification);
    RNVoipPushNotification.registerVoipToken();
    const answerCallSubscription = RNCallKeep.addEventListener(
      "answerCall",
      handleAnswerCall,
    );
    const endCallSubscription = RNCallKeep.addEventListener(
      "endCall",
      handleEndCall,
    );

    return () => {
      RNVoipPushNotification.removeEventListener("register");
      RNVoipPushNotification.removeEventListener("notification");
      answerCallSubscription.remove();
      endCallSubscription.remove();
    };
  }, [session?.user?.id]);
}