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
 *
 * Known gap: on Linux (WebKitGTK) an `<audio>` element's play() never settles —
 * from the tauri:// asset URL or from a Blob alike — so these are silent there.
 * Web Audio (fetch + decodeAudioData + a buffer source) does play on that
 * engine; that's the fix if the Linux desktop build is ever shipped again (it
 * isn't as of 2.1.0 — see docs/architecture/NATIVE_VOICE.md).
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
    // Best-effort — a sound must never break the voice flow. Logged rather
    // than swallowed: silent failures are how the Linux gap above went unseen.
    void audio.play().catch((err: unknown) => {
      // Autoplay can also be blocked before the first user gesture.
      console.warn("[sounds] playback failed", url, err);
    });
  } catch (err) {
    console.warn("[sounds] couldn't start playback", url, err);
  }
};

export const playVoiceJoinSound = (): void => play(joinUrl);
export const playVoiceLeaveSound = (): void => play(leaveUrl);
export const playNotificationSound = (): void => play(notificationUrl);
