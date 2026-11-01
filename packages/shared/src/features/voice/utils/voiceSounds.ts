export type VoiceSoundEvent =
  | "join"
  | "leave"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen";
export type VoiceSoundSettings = { enabled: boolean; volume: number };
export const defaultVoiceSoundSettings = (): VoiceSoundSettings => ({
  enabled: true,
  volume: 50,
});

export function normalizeVoiceSoundSettings(
  value: unknown,
): VoiceSoundSettings {
  const defaults = defaultVoiceSoundSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Partial<VoiceSoundSettings>;
  return {
    enabled:
      typeof record.enabled === "boolean" ? record.enabled : defaults.enabled,
    volume:
      typeof record.volume === "number" && Number.isFinite(record.volume)
        ? Math.max(0, Math.min(100, Math.round(record.volume)))
        : defaults.volume,
  };
}

export type VoiceSoundPlayer = (
  event: VoiceSoundEvent,
  volume: number,
) => Promise<void>;

/** Local action feedback has no focus gate or shared throttle. Every invocation plays. */
export async function playVoiceSound(
  event: VoiceSoundEvent,
  settings: VoiceSoundSettings,
  player: VoiceSoundPlayer,
): Promise<boolean> {
  const { enabled, volume } = normalizeVoiceSoundSettings(settings);
  if (!enabled || volume === 0) return false;
  try {
    await player(event, volume / 100);
    return true;
  } catch (error) {
    console.warn("[voice:sound] Playback failed", event, error);
    return false;
  }
}
