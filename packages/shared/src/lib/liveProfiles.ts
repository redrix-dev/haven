import type { LiveProfileIdentity } from "@shared/lib/backend/types";

export type LiveProfilesRecord = Record<string, LiveProfileIdentity>;

export const getLiveProfile = (
  profiles: LiveProfilesRecord,
  userId?: string | null,
): LiveProfileIdentity | undefined => (userId ? profiles[userId] : undefined);

export const resolveLiveUsername = (
  profiles: LiveProfilesRecord,
  userId: string | null | undefined,
  fallbackUsername: string | null | undefined,
): string | null =>
  getLiveProfile(profiles, userId)?.username ?? fallbackUsername ?? null;

export const resolveLiveAvatarUrl = (
  profiles: LiveProfilesRecord,
  userId: string | null | undefined,
  fallbackAvatarUrl: string | null | undefined,
): string | null =>
  getLiveProfile(profiles, userId)?.avatarUrl ?? fallbackAvatarUrl ?? null;
