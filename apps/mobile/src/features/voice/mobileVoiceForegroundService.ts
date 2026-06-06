import { Platform } from "react-native";

const VOICE_NOTIFICATION_ID = 48031;
const VOICE_NOTIFICATION_ACTION = "haven.voice.open";

type ReactNativeForegroundService =
  typeof import("@supersami/rn-foreground-service").default;

let registered = false;
let foregroundServicePromise: Promise<ReactNativeForegroundService | null> | null =
  null;

function loadForegroundService(): Promise<ReactNativeForegroundService | null> {
  if (Platform.OS !== "android") return Promise.resolve(null);
  foregroundServicePromise ??= new Promise((resolve) => {
    try {
      const module = require("@supersami/rn-foreground-service") as {
        default: ReactNativeForegroundService;
      };
      resolve(module.default);
    } catch (error) {
      foregroundServicePromise = null;
      console.warn(
        "[voice] Android foreground service module unavailable.",
        error,
      );
      resolve(null);
    }
  });
  return foregroundServicePromise;
}

async function registerForegroundService(): Promise<ReactNativeForegroundService | null> {
  const service = await loadForegroundService();
  if (!service) return null;
  if (registered) return service;
  registered = true;
  service.register({
    config: {
      alert: false,
      onServiceErrorCallBack: () => {
        console.warn("[voice] Android foreground service failed to start.");
      },
    },
  });
  return service;
}

export function addVoiceNotificationOpenListener(
  onOpen: () => void,
): () => void {
  if (Platform.OS !== "android") return () => {};
  let disposed = false;
  let unsubscribe: (() => void) | null = null;

  void registerForegroundService().then((service) => {
    if (!service || disposed) return;
    unsubscribe = service.eventListener((event: unknown) => {
      const payload = event as { main?: string; button?: string } | null;
      if (payload?.main === VOICE_NOTIFICATION_ACTION) {
        onOpen();
      }
    });
  });

  return () => {
    disposed = true;
    unsubscribe?.();
  };
}

export async function startVoiceForegroundService(
  channelName: string | null,
): Promise<void> {
  if (Platform.OS !== "android") return;
  const service = await registerForegroundService();
  if (!service) return;

  const message = channelName
    ? `Connected to ${channelName}`
    : "Voice session connected";
  const payload = {
    id: VOICE_NOTIFICATION_ID,
    title: "Haven voice connected",
    message,
    vibration: false,
    visibility: "public",
    icon: "ic_launcher",
    largeIcon: "ic_launcher",
    importance: "low",
    mainOnPress: VOICE_NOTIFICATION_ACTION,
    setOnlyAlertOnce: "true",
    ServiceType: "microphone",
  };

  try {
    if (service.is_running()) {
      await service.update(payload);
      return;
    }
    await service.start(payload);
  } catch (error) {
    console.warn("[voice] Failed to start Android foreground service.", error);
  }
}

export async function stopVoiceForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return;
  const service = await loadForegroundService();
  if (!service) return;
  try {
    if (service.is_running()) {
      await service.stopAll();
    }
  } catch (error) {
    console.warn("[voice] Failed to stop Android foreground service.", error);
  }
}
