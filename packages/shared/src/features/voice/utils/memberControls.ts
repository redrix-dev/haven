export type VoiceMemberAction =
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "remove";
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

export function parseVoiceControlEvent(
  payload: Record<string, unknown>,
): VoiceControlEvent | null {
  const keys = [
    "community_id",
    "channel_id",
    "channel_name",
    "target_user_id",
    "target_session_id",
    "actor_user_id",
    "actor_name",
  ] as const;
  if (keys.some((key) => typeof payload[key] !== "string" || !payload[key]))
    return null;
  if (
    !["mute", "unmute", "deafen", "undeafen", "remove"].includes(
      String(payload.action),
    )
  )
    return null;
  return {
    communityId: payload.community_id as string,
    channelId: payload.channel_id as string,
    channelName: payload.channel_name as string,
    targetUserId: payload.target_user_id as string,
    targetSessionId: payload.target_session_id as string,
    actorUserId: payload.actor_user_id as string,
    actorName: payload.actor_name as string,
    action: payload.action as VoiceMemberAction,
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
