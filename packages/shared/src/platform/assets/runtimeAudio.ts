/**
 * Mobile stub for @platform/assets/runtimeAudio.
 *
 * On mobile, notification and voice sounds are played via Expo AV in
 * sound.native.ts — this file is never imported at runtime.  It exists so
 * that the mobile TypeScript compiler can resolve the shared/src/…/sound.ts
 * import (which Metro replaces with sound.native.ts at bundle time).
 *
 * A desktop/web shell that plays these sounds should provide its own
 * implementation with real asset URLs and the same shape.
 */
export const RUNTIME_AUDIO_URLS = {
  notifications: { default: "" },
  voicePresence: { join: "", leave: "" },
  voice: { speakerTest: "" },
} as const;
