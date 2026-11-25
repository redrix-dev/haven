/**
 * Device-wide keys, kept whoever is signed in. A person's own device copies are
 * keyed by their id instead (`collections/kit/deviceCopies.ts`).
 */
export const STORAGE_KEYS = {
  voiceSounds: "haven:preferences:voice-sounds",
  voiceSettings: "haven:preferences:voice-settings",
  /** A destination link clicked while signed out; opened once after sign-in (see linkPipeline). */
  pendingLink: "haven:links:pending",
} as const;
