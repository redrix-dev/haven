import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import type { VoiceMemberAction } from "@shared/features/voice/utils/memberControls";

export type VoiceTokenResponse = {
  token: string;
  serverUrl: string;
};

export type VoiceTokenBackend = {
  sendControl?: (input: {
    communityId: string;
    channelId: string;
    targetUserId: string;
    targetSessionId: string;
    action: VoiceMemberAction;
  }) => Promise<void>;
  fetchToken: (
    communityId: string,
    channelId: string,
  ) => Promise<VoiceTokenResponse>;
};

export function createVoiceTokenBackend(
  client: HavenSupabaseClient,
): VoiceTokenBackend {
  return {
    sendControl: async (input) => {
      const { error } = await client.rpc("send_voice_control", {
        p_community_id: input.communityId,
        p_channel_id: input.channelId,
        p_target_user_id: input.targetUserId,
        p_target_session_id: input.targetSessionId,
        p_action: input.action,
      });
      if (error) throw error;
    },
    fetchToken: async (communityId, channelId) => {
      const { data, error } = await client.functions.invoke("voice-token", {
        body: { communityId, channelId },
      });
      if (error) throw error;
      const result = data as VoiceTokenResponse;
      if (!result?.token || !result?.serverUrl) {
        throw new Error("Invalid voice token response from server.");
      }
      return result;
    },
  };
}
