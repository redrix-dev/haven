import type { Accessor } from "solid-js";
import type { UserProfileInfo } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { LiveProfilesRecord } from "@shared/lib/liveProfiles";
import { createStoreSelector } from "../fromStore";
import type { ProfileSolidCache } from "./profileSolidCache";

/** The live identity map (realtime PROFILE_IDENTITY_CHANGE + viewer seed). */
export function createLiveProfiles(
  cache: ProfileSolidCache,
): Accessor<LiveProfilesRecord> {
  return createStoreSelector(cache.reactiveStore, (state) => state.profiles);
}

export function createViewerProfile(
  cache: ProfileSolidCache,
  userId: Accessor<string | null>,
): Accessor<UserProfileInfo | null> {
  return createStoreSelector(cache.reactiveStore, (state) => {
    const id = userId();
    return id ? (state.viewerProfiles[id] ?? null) : null;
  });
}
