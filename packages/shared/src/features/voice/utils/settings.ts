import { DEFAULT_VOICE_SETTINGS } from "@shared/infrastructure/constants";
import type {
  VoiceSettings,
  VoicePushToTalkBinding,
} from "@shared/types/settings";
import { formatVoicePushToTalkBindingLabel } from "./pushToTalk";

export function normalizeVoiceSettings(value: unknown): VoiceSettings {
  const record =
    value && typeof value === "object" ? (value as Partial<VoiceSettings>) : {};
  const rawThreshold: unknown = record.voiceActivationThreshold;
  const numeric =
    typeof rawThreshold === "number" ||
    (typeof rawThreshold === "string" && rawThreshold.trim())
      ? Number(rawThreshold)
      : NaN;
  const raw =
    record.pushToTalkBinding === undefined
      ? DEFAULT_VOICE_SETTINGS.pushToTalkBinding
      : record.pushToTalkBinding;
  let binding: VoicePushToTalkBinding | null = null;
  if (raw && typeof raw.code === "string" && raw.code.trim()) {
    binding = {
      code: raw.code,
      key: typeof raw.key === "string" ? raw.key : null,
      ctrlKey: !!raw.ctrlKey,
      altKey: !!raw.altKey,
      shiftKey: !!raw.shiftKey,
      metaKey: !!raw.metaKey,
      label: "",
    };
    binding.label = formatVoicePushToTalkBindingLabel(binding);
  }
  return {
    preferredInputDeviceId:
      typeof record.preferredInputDeviceId === "string"
        ? record.preferredInputDeviceId
        : DEFAULT_VOICE_SETTINGS.preferredInputDeviceId,
    preferredOutputDeviceId:
      typeof record.preferredOutputDeviceId === "string"
        ? record.preferredOutputDeviceId
        : DEFAULT_VOICE_SETTINGS.preferredOutputDeviceId,
    voiceActivationThreshold: Number.isFinite(numeric)
      ? Math.max(0, Math.min(100, Math.round(numeric)))
      : DEFAULT_VOICE_SETTINGS.voiceActivationThreshold,
    transmissionMode:
      record.transmissionMode === "open_mic" ||
      record.transmissionMode === "push_to_talk" ||
      record.transmissionMode === "voice_activity"
        ? record.transmissionMode
        : DEFAULT_VOICE_SETTINGS.transmissionMode,
    pushToTalkBinding: binding,
  };
}
