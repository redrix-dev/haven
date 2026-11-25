import type { VoiceControl } from "@shared/lib/backend/realtime";
import type { VoiceControlAction } from "@shared/lib/backend/records";

export type VoiceMemberAction = VoiceControlAction;
export type VoiceControlEvent = {
  communityId: string;
  channelId: string;
  channelName: string;
  targetUserId: string;
  targetSessionId: string;
  actorUserId: string;
  actorName: string;
  action: VoiceMemberAction;
};

/** The `voice.control` event as the voice session names it. */
export function voiceControlEvent(control: VoiceControl): VoiceControlEvent {
  return {
    communityId: control.community_id,
    channelId: control.channel_id,
    channelName: control.channel_name,
    targetUserId: control.target_user_id,
    targetSessionId: control.target_session_id,
    actorUserId: control.actor_id,
    // A deleted account has no name.
    actorName: control.actor_name ?? "a moderator",
    action: control.action,
  };
}

export function voiceControlMessage(event: VoiceControlEvent): string {
  if (event.action === "remove")
    return `You've been removed from ${event.channelName} by ${event.actorName}.`;
  const deafened = event.action === "deafen";
  return `You've been ${deafened ? "deafened" : "muted"} by ${event.actorName}. When you're ready to get back to the conversation, just ${deafened ? "undeafen" : "unmute"} normally.`;
}

/** Correlates a courtesy command with the call the actor saw; not an auth token. */
export function createVoiceControlSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function readVoiceControlSessionId(
  metadata: string | undefined,
): string | undefined {
  try {
    const value: unknown = JSON.parse(metadata ?? "{}");
    if (
      value &&
      typeof value === "object" &&
      "voiceSessionId" in value &&
      typeof value.voiceSessionId === "string"
    )
      return value.voiceSessionId;
  } catch {
    /* Older clients can omit session metadata. */
  }
  return undefined;
}

export function readVoiceDeafened(metadata: string | undefined): boolean {
  try {
    return (
      (JSON.parse(metadata ?? "{}") as { deafened?: unknown }).deafened === true
    );
  } catch {
    return false;
  }
}

/** Mobile hard mute disables capture while retaining its publication. */
export function readVoiceHardMuted(metadata: string | undefined): boolean {
  try {
    return (
      (JSON.parse(metadata ?? "{}") as { hardMuted?: unknown }).hardMuted ===
      true
    );
  } catch {
    return false;
  }
}

export function mergeVoiceMetadata(
  metadata: string | undefined,
  patch: Record<string, unknown>,
): string {
  let base: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(metadata ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      base = parsed as Record<string, unknown>;
  } catch {
    /* Replace invalid old metadata. */
  }
  return JSON.stringify({ ...base, ...patch });
}
