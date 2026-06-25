import joinUrl from "@shared/assets/audio/voice/haven-connected.mp3";
import leaveUrl from "@shared/assets/audio/voice/haven-disconnected.mp3";
import notificationUrl from "@shared/assets/audio/notifications/haven-notification.mp3";

/**
 * Web sound playback for voice presence + notifications.
 *
 * The shared `notifications/utils/sound.ts` is the cross-platform,
 * settings-aware player — but it reads `RUNTIME_AUDIO_URLS` from the `@platform`
 * stub (empty on web), and the solid tsconfig doesn't currently resolve
 * `@platform`. This is a focused web player over the recovered assets; folding
 * it into the shared settings policy (volume / enabled / focus) is a follow-up.
 */

let lastPlayedAt = 0;
const MIN_INTERVAL_MS = 400;

const play = (url: string, volume = 0.5): void => {
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
  lastPlayedAt = now;
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    void audio.play().catch(() => {
      // Autoplay can be blocked before the first user gesture; best-effort.
    });
  } catch {
    // best-effort — never let a sound break the voice flow
  }
};

export const playVoiceJoinSound = (): void => play(joinUrl);
export const playVoiceLeaveSound = (): void => play(leaveUrl);
export const playNotificationSound = (): void => play(notificationUrl);
