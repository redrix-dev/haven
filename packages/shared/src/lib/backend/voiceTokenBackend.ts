import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";

export type VoiceTokenResponse = {
  token: string;
  serverUrl: string;
};

export type VoiceTokenBackend = {
  fetchToken: (
    communityId: string,
    channelId: string,
  ) => Promise<VoiceTokenResponse>;
};

export function createVoiceTokenBackend(
  client: HavenSupabaseClient,
): VoiceTokenBackend {
  return {
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
