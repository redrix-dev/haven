/**
 * Mobile stub for @platform/assets/runtimeAudio.
 *
 * This exists so the mobile TypeScript compiler can resolve the web
 * notification player's imports (Metro replaces sound.ts with the native
 * notification stub). Mobile voice confirmations use HavenVoiceSounds through
 * mobileVoiceSounds.ts, not this URL map. See docs/architecture/VOICE_SOUNDS.md.
 *
 * A desktop/web shell that plays these sounds should provide its own
 * implementation with real asset URLs and the same shape.
 */
export const RUNTIME_AUDIO_URLS = {
  notifications: { default: "" },
  voicePresence: { join: "", leave: "" },
  voice: { speakerTest: "" },
} as const;
