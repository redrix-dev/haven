import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";

const LAST_VOIP_TOKEN_KEY = "haven:lastVoipPushToken";

type CallKeepStatic = {
  setup: (options: Record<string, unknown>) => Promise<boolean> | void;
  setAvailable: (available: boolean) => void;
  addEventListener: (
    eventName: string,
    handler: (...args: unknown[]) => void,
  ) => { remove: () => void } | (() => void);
};

type VoipPushStatic = {
  registerVoipToken: () => void;
  addEventListener: (
    eventName: string,
    handler: (...args: unknown[]) => void,
  ) => { remove: () => void } | (() => void);
};

function resolveModule<T>(id: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id) as T;
  } catch {
    return null;
  }
}

function removeSubscription(
  sub: { remove: () => void } | (() => void) | null,
): void {
  if (!sub) return;
  if (typeof sub === "function") {
    sub();
    return;
  }
  sub.remove();
}

/**
 * Boots minimal VoIP + CallKeep native foundations.
 * This intentionally wires registration/events only; full call UX is implemented later.
 */
export function useMobileVoipFoundation(
  session: Session | null | undefined,
): void {
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const callKeep = resolveModule<CallKeepStatic>("react-native-callkeep");
    const voipPush = resolveModule<VoipPushStatic>(
      "react-native-voip-push-notification",
    );
    if (!callKeep || !voipPush) return;

    let disposed = false;

    void Promise.resolve(
      callKeep.setup({
        ios: {
          appName: "Haven",
          supportsVideo: true,
          includesCallsInRecents: false,
          maximumCallGroups: "1",
          maximumCallsPerCallGroup: "1",
        },
      }),
    ).catch((error) => {
      console.warn("[voip] CallKeep setup failed.", error);
    });

    callKeep.setAvailable(true);
    voipPush.registerVoipToken();

    const registerSub = voipPush.addEventListener(
      "register",
      (voipToken: unknown) => {
        if (typeof voipToken !== "string" || !voipToken.trim()) return;
        void AsyncStorage.setItem(LAST_VOIP_TOKEN_KEY, voipToken.trim());
      },
    );

    const notificationSub = voipPush.addEventListener(
      "notification",
      (_payload: unknown) => {
        // Foundation only: keep event subscribed so native ingress is verified.
      },
    );

    const answerSub = callKeep.addEventListener("answerCall", () => {
      // Foundation only: call handling will be connected to voice runtime later.
    });

    const endSub = callKeep.addEventListener("endCall", () => {
      // Foundation only: call handling will be connected to voice runtime later.
    });

    return () => {
      disposed = true;
      if (disposed) {
        removeSubscription(registerSub);
        removeSubscription(notificationSub);
        removeSubscription(answerSub);
        removeSubscription(endSub);
      }
    };
  }, [session?.user?.id]);
}
