import { Platform } from "react-native";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";

const VOICE_NOTIFICATION_ID = 48031;
const VOICE_NOTIFICATION_ACTION = "haven.voice.open";

let registered = false;

function registerForegroundService(): void {
  if (registered || Platform.OS !== "android") return;
  registered = true;
  ReactNativeForegroundService.register({
    config: {
      alert: false,
      onServiceErrorCallBack: () => {
        console.warn("[voice] Android foreground service failed to start.");
      },
    },
  });
}

export function addVoiceNotificationOpenListener(onOpen: () => void): () => void {
  if (Platform.OS !== "android") return () => {};
  registerForegroundService();
  return ReactNativeForegroundService.eventListener((event: unknown) => {
    const payload = event as { main?: string; button?: string } | null;
    if (payload?.main === VOICE_NOTIFICATION_ACTION) {
      onOpen();
    }
  });
}

export async function startVoiceForegroundService(channelName: string | null): Promise<void> {
  if (Platform.OS !== "android") return;
  registerForegroundService();

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
    if (ReactNativeForegroundService.is_running()) {
      await ReactNativeForegroundService.update(payload);
      return;
    }
    await ReactNativeForegroundService.start(payload);
  } catch (error) {
    console.warn("[voice] Failed to start Android foreground service.", error);
  }
}

export async function stopVoiceForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    if (ReactNativeForegroundService.is_running()) {
      await ReactNativeForegroundService.stopAll();
    }
  } catch (error) {
    console.warn("[voice] Failed to stop Android foreground service.", error);
  }
}
