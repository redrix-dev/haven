export function filterBlockedUsersFromParticipantList<
  T extends { userId: string },
>(
  participants: ReadonlyArray<T>,
  blockedUserIds: ReadonlySet<string>,
  isElevatedViewer: boolean,
) {
  if (isElevatedViewer || blockedUserIds.size === 0) {
    return [...participants];
  }

  return participants.filter(
    (participant) => !blockedUserIds.has(participant.userId),
  );
}

export function filterBlockedUsersFromParticipantRecord<
  T extends { userId: string },
>(
  participantsByChannelId: Record<string, T[]>,
  blockedUserIds: ReadonlySet<string>,
  isElevatedViewer: boolean,
) {
  if (isElevatedViewer || blockedUserIds.size === 0) {
    return participantsByChannelId;
  }

  return Object.fromEntries(
    Object.entries(participantsByChannelId).map(([channelId, participants]) => [
      channelId,
      participants.filter(
        (participant) => !blockedUserIds.has(participant.userId),
      ),
    ]),
  ) as Record<string, T[]>;
}
