// What the two voice functions agree on: where the voice service (LiveKit) is
// and what a channel's room is called there.

import { env } from "./common.ts";

export type VoiceService = { url: string; apiKey: string; apiSecret: string };

/** The voice service's address and keys, or null when voice is not set up. */
export function voiceService(): VoiceService | null {
  const url = env("LIVEKIT_URL");
  const apiKey = env("LIVEKIT_API_KEY");
  const apiSecret = env("LIVEKIT_API_SECRET");
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

/** A voice channel's room is named by the channel's id, which is unique. */
export function roomName(channelId: string): string {
  return channelId;
}

export const notConfigured = {
  reason: "voice_not_configured",
  message: "Voice is not set up on this server.",
} as const;
