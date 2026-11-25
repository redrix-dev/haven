/**
 * Voice. DATABASE.md: "Voice".
 *
 * The database decides who may join and who may moderate; the voice service
 * (LiveKit) carries the sound. Both calls go through Edge Functions, because
 * only the server holds the voice service's signing key.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { fromFunctionError } from "./havenError";
import type { VoiceControlAction } from "./records";

export type VoiceToken = {
  /** Lets the holder into this channel's room for ten minutes. */
  token: string;
  serverUrl: string;
};

export type VoiceControlResult = {
  ok: true;
  /**
   * For `remove`: whether the voice service disconnected them too. False
   * means their app was told but they may still be connected. Null for the
   * other actions, which are only ever requests to the person's app.
   */
  enforced: boolean | null;
};

export function createVoiceBackend(client: HavenSupabaseClient) {
  async function invoke<T>(fn: string, body: object): Promise<T> {
    const { data, error } = await client.functions.invoke(fn, { body });
    if (error) throw await fromFunctionError(error);
    return data as T;
  }

  return {
    /** Refused with `channel_not_found` when the caller may not join. */
    getVoiceToken(channelId: string): Promise<VoiceToken> {
      return invoke<VoiceToken>("voice-token", { channelId });
    },

    /**
     * Mutes, deafens or removes one session. The caller's own sessions
     * always; someone else's with `manage_members` and a higher rank.
     */
    sendVoiceControl(input: {
      channel_id: string;
      user_id: string;
      session_id: string;
      action: VoiceControlAction;
    }): Promise<VoiceControlResult> {
      return invoke<VoiceControlResult>("voice-control", {
        channelId: input.channel_id,
        userId: input.user_id,
        sessionId: input.session_id,
        action: input.action,
      });
    },
  };
}

export type VoiceBackend = ReturnType<typeof createVoiceBackend>;
