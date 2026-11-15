// Hands a person the token that lets them into one voice channel's room.
//
// The database decides whether they may join (get_voice_access, called with
// their own token) and says who they are. This function only signs that
// answer for the voice service, which the apps cannot be trusted to do: the
// signing key never leaves the server.

import { AccessToken } from "npm:livekit-server-sdk@2";
import {
  callerDb,
  corsHeaders,
  refusal,
  reply,
  UUID_PATTERN,
} from "../_shared/common.ts";
import { notConfigured, roomName, voiceService } from "../_shared/voice.ts";

type VoiceAccess = {
  channel_id: string;
  community_id: string;
  channel_name: string;
  can_moderate: boolean;
  user_id: string;
  username: string;
};

// How long the token can be used to walk in. Once someone is connected the
// voice service keeps their session going by itself, so this only bounds how
// long a copied or left-over token stays useful.
const TOKEN_LIFETIME = "10m";

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ reason: "method_not_allowed", message: "Use POST." }, 405);
  }
  const db = callerDb(req);
  if (!db) {
    return reply({ reason: "not_signed_in", message: "Sign in first." }, 401);
  }
  const body = await req.json().catch(() => null);
  const channelId = body?.channelId;
  if (typeof channelId !== "string" || !UUID_PATTERN.test(channelId)) {
    return reply(
      { reason: "channel_invalid", message: "That is not a channel." },
      400,
    );
  }

  const { data, error } = await db.rpc("get_voice_access", {
    p_channel_id: channelId,
  });
  if (error) return refusal(error);
  const access = (data as VoiceAccess[] | null)?.[0];
  if (!access) {
    return reply(
      {
        reason: "channel_not_found",
        message: "That voice channel could not be found.",
      },
      404,
    );
  }

  const voice = voiceService();
  if (!voice) return reply(notConfigured, 503);

  const token = new AccessToken(voice.apiKey, voice.apiSecret, {
    identity: access.user_id,
    name: access.username,
    ttl: TOKEN_LIFETIME,
  });
  token.addGrant({
    roomJoin: true,
    room: roomName(access.channel_id),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });
  return reply({ token: await token.toJwt(), serverUrl: voice.url });
}
