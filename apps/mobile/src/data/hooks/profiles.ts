import type { ProfileNexus } from "../profile/ProfileNexus";
import type {
  PlatformStaffInfo,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  LiveProfileIdentity,
  UserFlairGrant,
  UserProfileCard,
} from "@shared/lib/backend/types";
import { useStoreSelector } from "./useStoreSelector";

export function useProfilesRecord(
  nexus: ProfileNexus,
): Record<string, LiveProfileIdentity> {
  return useStoreSelector(nexus.reactiveStore, (state) => {
    void state.revision;
    return state.profiles;
  });
}

export function useViewerProfile(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): UserProfileInfo | null {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.viewerProfiles[userId] ?? null) : null,
  );
}

export function useProfileCard(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): UserProfileCard | null {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.profileCards[userId] ?? null) : null,
  );
}

export function useProfileCardLoading(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? Boolean(state.profileCardLoading[userId]) : false,
  );
}

export function useProfileCardError(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): string | null {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.profileCardErrors[userId] ?? null) : null,
  );
}

export function useUserFlairGrants(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): UserFlairGrant[] {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.userFlairGrants[userId] ?? []) : [],
  );
}

export function useUserFlairGrantLoading(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? Boolean(state.userFlairGrantLoading[userId]) : false,
  );
}

export function useUserFlairGrantError(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): string | null {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.userFlairGrantErrors[userId] ?? null) : null,
  );
}

export function usePlatformStaff(
  nexus: ProfileNexus,
  userId: string | null | undefined,
): PlatformStaffInfo | null {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    userId ? (state.platformStaff[userId] ?? null) : null,
  );
}
