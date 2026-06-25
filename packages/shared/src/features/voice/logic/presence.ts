import type {
  VoicePresenceStateRow,
  VoiceSidebarParticipant,
} from "@shared/types/types";
import type { VoiceKickPayload, VoiceRealtimeEventPayload } from "../types";

export const voiceParticipantListsEqual = (
  left: VoiceSidebarParticipant[],
  right: VoiceSidebarParticipant[],
): boolean =>
  left.length === right.length &&
  left.every(
    (entry, index) =>
      entry.userId === right[index]?.userId &&
      entry.displayName === right[index]?.displayName &&
      entry.avatarUrl === right[index]?.avatarUrl &&
      entry.isSpeaking === right[index]?.isSpeaking,
  );

export const voiceParticipantRecordsEqual = (
  left: Record<string, VoiceSidebarParticipant[]>,
  right: Record<string, VoiceSidebarParticipant[]>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    voiceParticipantListsEqual(left[key] ?? [], right[key] ?? []),
  );
};

export const normalizePresenceRows = (
  presenceState: Record<string, VoicePresenceStateRow[]>,
): VoiceSidebarParticipant[] => {
  const participantsByUserId = new Map<string, VoiceSidebarParticipant>();

  for (const [presenceKey, presenceRows] of Object.entries(presenceState)) {
    const latestPresence = presenceRows[presenceRows.length - 1];
    if (!latestPresence) continue;

    const userId = latestPresence.user_id ?? presenceKey;
    if (!userId) continue;

    const trimmedDisplayName = latestPresence.display_name?.trim() ?? "";
    const displayName =
      trimmedDisplayName.length > 0 ? trimmedDisplayName : userId.slice(0, 12);

    if (!participantsByUserId.has(userId)) {
      participantsByUserId.set(userId, {
        userId,
        displayName,
        avatarUrl: latestPresence.avatar_url ?? null,
        isSpeaking: Boolean(latestPresence.is_speaking),
      });
    }
  }

  return Array.from(participantsByUserId.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
};

export const resolveKickPayload = (
  eventPayload: VoiceRealtimeEventPayload,
): VoiceKickPayload | null => {
  const payload = eventPayload.payload;
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const targetUserId = record.targetUserId;
  const channelId = record.channelId;
  const kickedBy = record.kickedBy;
  if (
    typeof targetUserId !== "string" ||
    typeof channelId !== "string" ||
    typeof kickedBy !== "string"
  ) {
    return null;
  }
  return { targetUserId, channelId, kickedBy };
};
