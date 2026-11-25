// Mutes, deafens or removes one voice session.
//
// The database authorises it and tells the target's own app
// (send_voice_control, called with the caller's token). A well-behaved app
// obeys. For "remove" that is not enough, because a modified app can ignore
// the message, so this function also disconnects the person at the voice
// service. Mute and deafen stay requests: the voice service has no way to
// stop someone hearing.

import { RoomServiceClient } from "npm:livekit-server-sdk@2";
import {
  callerDb,
  corsHeaders,
  describeError,
  refusal,
  reply,
  UUID_PATTERN,
} from "../_shared/common.ts";
import { roomName, voiceService } from "../_shared/voice.ts";

const ACTIONS = ["mute", "unmute", "deafen", "undeafen", "remove"];

/** Disconnects the person from the room. True when they are out of it. */
async function removeFromRoom(
  channelId: string,
  userId: string,
): Promise<boolean> {
  const voice = voiceService();
  if (!voice) return false;
  // The voice service's management API speaks https at the same address the
  // apps reach over wss.
  const client = new RoomServiceClient(
    voice.url.replace(/^ws/, "http"),
    voice.apiKey,
    voice.apiSecret,
  );
  try {
    await client.removeParticipant(roomName(channelId), userId);
    return true;
  } catch (error) {
    const fault = error as { status?: number; code?: string };
    // Not in the room is what we wanted.
    if (fault.status === 404 || fault.code === "not_found") return true;
    console.error(`voice-control: remove failed: ${describeError(error)}`);
    return false;
  }
}

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
  const { channelId, userId, sessionId, action } = body ?? {};
  if (
    typeof channelId !== "string" ||
    !UUID_PATTERN.test(channelId) ||
    typeof userId !== "string" ||
    !UUID_PATTERN.test(userId) ||
    typeof sessionId !== "string" ||
    !ACTIONS.includes(action)
  ) {
    return reply(
      { reason: "request_invalid", message: "That request is not valid." },
      400,
    );
  }

  const { error } = await db.rpc("send_voice_control", {
    p_channel_id: channelId,
    p_user_id: userId,
    p_session_id: sessionId,
    p_action: action,
  });
  if (error) return refusal(error);

  // `enforced` is false when the request was sent but the voice service could
  // not be told, so the app can say the person may still be connected.
  const enforced =
    action === "remove" ? await removeFromRoom(channelId, userId) : null;
  return reply({ ok: true, enforced });
}
