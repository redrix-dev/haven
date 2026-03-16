import React from 'react';

const STORAGE_KEY = 'haven:voice:member-volumes:v1';
const DEFAULT_MEMBER_VOLUME = 100;
const MIN_MEMBER_VOLUME = 0;
const MAX_MEMBER_VOLUME = 200;
const EXPIRY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_STORED_ENTRIES = 500;

type StoredVolumeEntry = {
  volume: number;
  updatedAt: number;
};

type StoredVolumeMap = Record<string, StoredVolumeEntry>;

const makeScopedUserKey = (communityId: string, channelId: string, userId: string) =>
  `${communityId}:${channelId}:${userId}`;

const coerceVolume = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_MEMBER_VOLUME;
  return Math.max(MIN_MEMBER_VOLUME, Math.min(MAX_MEMBER_VOLUME, Math.round(value)));
};

const readStoredVolumes = (now: number): StoredVolumeMap => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed == null) return {};

    const entries = Object.entries(parsed as Record<string, unknown>);
    const pruned: StoredVolumeMap = {};

    for (const [storageKey, value] of entries) {
      if (typeof value !== 'object' || value == null) continue;
      const candidate = value as Partial<StoredVolumeEntry>;
      if (typeof candidate.updatedAt !== 'number' || !Number.isFinite(candidate.updatedAt)) continue;
      if (now - candidate.updatedAt > EXPIRY_WINDOW_MS) continue;
      if (typeof candidate.volume !== 'number') continue;
      pruned[storageKey] = {
        volume: coerceVolume(candidate.volume),
        updatedAt: candidate.updatedAt,
      };
    }

    return pruned;
  } catch {
    return {};
  }
};

const writeStoredVolumes = (entries: StoredVolumeMap) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures and keep settings in-memory.
  }
};

const pruneMaxEntries = (entries: StoredVolumeMap): StoredVolumeMap => {
  const sortedEntries = Object.entries(entries).sort(([, left], [, right]) => right.updatedAt - left.updatedAt);
  return Object.fromEntries(sortedEntries.slice(0, MAX_STORED_ENTRIES));
};

export const getVoiceMemberVolume = (
  volumes: Record<string, number>,
  userId: string
): number => coerceVolume(volumes[userId] ?? DEFAULT_MEMBER_VOLUME);

export function useVoiceMemberVolumes(communityId: string, channelId: string, connectedUserIds: string[]) {
  const [volumes, setVolumes] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const now = Date.now();
    const stored = readStoredVolumes(now);

    // Run periodic storage cleanup when loading this hook.
    writeStoredVolumes(pruneMaxEntries(stored));

    const nextVolumes: Record<string, number> = {};
    for (const userId of connectedUserIds) {
      const entry = stored[makeScopedUserKey(communityId, channelId, userId)];
      nextVolumes[userId] = coerceVolume(entry?.volume ?? DEFAULT_MEMBER_VOLUME);
    }
    setVolumes(nextVolumes);
  }, [channelId, communityId, connectedUserIds]);

  const persist = React.useCallback(
    (updater: (current: StoredVolumeMap, now: number) => StoredVolumeMap) => {
      const now = Date.now();
      const current = readStoredVolumes(now);
      const next = updater(current, now);
      writeStoredVolumes(pruneMaxEntries(next));
    },
    []
  );

  const setMemberVolume = React.useCallback(
    (userId: string, volume: number) => {
      const normalized = coerceVolume(volume);
      setVolumes((current) => ({
        ...current,
        [userId]: normalized,
      }));

      persist((currentStored, now) => ({
        ...currentStored,
        [makeScopedUserKey(communityId, channelId, userId)]: {
          volume: normalized,
          updatedAt: now,
        },
      }));
    },
    [channelId, communityId, persist]
  );

  const resetMemberVolume = React.useCallback(
    (userId: string) => {
      setMemberVolume(userId, DEFAULT_MEMBER_VOLUME);
    },
    [setMemberVolume]
  );

  const resetAllMemberVolumes = React.useCallback(() => {
    setVolumes((current) => {
      const next: Record<string, number> = {};
      for (const userId of Object.keys(current)) {
        next[userId] = DEFAULT_MEMBER_VOLUME;
      }
      return next;
    });

    persist((currentStored, now) => {
      const nextStored = { ...currentStored };
      for (const userId of connectedUserIds) {
        nextStored[makeScopedUserKey(communityId, channelId, userId)] = {
          volume: DEFAULT_MEMBER_VOLUME,
          updatedAt: now,
        };
      }
      return nextStored;
    });
  }, [channelId, communityId, connectedUserIds, persist]);

  return {
    remoteVolumes: volumes,
    setMemberVolume,
    resetMemberVolume,
    resetAllMemberVolumes,
    getMemberVolume: (userId: string) => getVoiceMemberVolume(volumes, userId),
  };
}
