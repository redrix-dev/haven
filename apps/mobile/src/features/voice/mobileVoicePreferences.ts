import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_VOICE_SETTINGS } from "@shared/infrastructure/constants";
import type { VoiceSettings, VoiceTransmissionMode } from "@shared/types/settings";
import { useCallback, useEffect, useState } from "react";

const MOBILE_VOICE_SETTINGS_KEY = "haven.mobile.voice.settings";
const SKIP_SWITCH_PROMPT_KEY = "haven.mobile.voice.skipSwitchPrompt";

type MobileTransmissionMode = Extract<
  VoiceTransmissionMode,
  "voice_activity" | "open_mic"
>;

const MOBILE_DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ...DEFAULT_VOICE_SETTINGS,
  transmissionMode: "voice_activity",
  pushToTalkBinding: null,
};

function coerceTransmissionMode(value: unknown): MobileTransmissionMode {
  return value === "open_mic" ? "open_mic" : "voice_activity";
}

function coerceThreshold(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return MOBILE_DEFAULT_VOICE_SETTINGS.voiceActivationThreshold;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function coerceVoiceSettings(value: unknown): VoiceSettings {
  if (typeof value !== "object" || value == null) {
    return MOBILE_DEFAULT_VOICE_SETTINGS;
  }
  const record = value as Partial<VoiceSettings>;
  return {
    preferredInputDeviceId:
      typeof record.preferredInputDeviceId === "string"
        ? record.preferredInputDeviceId
        : MOBILE_DEFAULT_VOICE_SETTINGS.preferredInputDeviceId,
    preferredOutputDeviceId:
      typeof record.preferredOutputDeviceId === "string"
        ? record.preferredOutputDeviceId
        : MOBILE_DEFAULT_VOICE_SETTINGS.preferredOutputDeviceId,
    transmissionMode: coerceTransmissionMode(record.transmissionMode),
    voiceActivationThreshold: coerceThreshold(record.voiceActivationThreshold),
    pushToTalkBinding: null,
  };
}

export async function loadMobileVoiceSettings(): Promise<VoiceSettings> {
  try {
    const raw = await AsyncStorage.getItem(MOBILE_VOICE_SETTINGS_KEY);
    if (!raw) return MOBILE_DEFAULT_VOICE_SETTINGS;
    return coerceVoiceSettings(JSON.parse(raw));
  } catch {
    return MOBILE_DEFAULT_VOICE_SETTINGS;
  }
}

export async function saveMobileVoiceSettings(settings: VoiceSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(
      MOBILE_VOICE_SETTINGS_KEY,
      JSON.stringify(coerceVoiceSettings(settings)),
    );
  } catch {
    // Voice settings are convenience prefs; failed storage should not block voice.
  }
}

export async function loadSkipVoiceSwitchPrompt(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SKIP_SWITCH_PROMPT_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function saveSkipVoiceSwitchPrompt(skip: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SKIP_SWITCH_PROMPT_KEY, skip ? "true" : "false");
  } catch {
    // Non-fatal; the next switch will simply show the confirmation again.
  }
}

export function useMobileVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(MOBILE_DEFAULT_VOICE_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void loadMobileVoiceSettings().then((stored) => {
      if (!cancelled) setSettings(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateVoiceSettingsPatch = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((current) => {
      const next = coerceVoiceSettings({ ...current, ...patch });
      void saveMobileVoiceSettings(next);
      return next;
    });
  }, []);

  return { settings, updateVoiceSettingsPatch };
}
