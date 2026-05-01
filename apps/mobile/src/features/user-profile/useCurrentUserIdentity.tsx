import { useEffect, useMemo, useState } from "react";
import { getControlPlaneBackend } from "@shared/lib/backend";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@shared/stores/authStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";

type CurrentUserIdentity = {
  userId: string | null;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  avatarInitial: string;
  loadingBaseProfile: boolean;
};

type BaseProfile = {
  username: string | null;
  avatarUrl: string | null;
};

export function useCurrentUserIdentity(): CurrentUserIdentity {
  const user = useAuthStore((state) => state.user);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);

  const [baseProfile, setBaseProfile] = useState<BaseProfile>({
    username: null,
    avatarUrl: null,
  });
  const [loadingBaseProfile, setLoadingBaseProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const userId = user?.id ?? null;
    if (!userId) {
      setBaseProfile({ username: null, avatarUrl: null });
      setLoadingBaseProfile(false);
      return;
    }

    setLoadingBaseProfile(true);

    void (async () => {
      try {
        const backend = getControlPlaneBackend();
        const profile = await backend.fetchUserProfile(userId);

        if (cancelled) return;
        setBaseProfile({
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        });
      } catch {
        if (cancelled) return;
        // Keep graceful fallback path; no throw.
        setBaseProfile((prev) => prev);
      } finally {
        if (!cancelled) setLoadingBaseProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return useMemo(() => {
    const userId = user?.id ?? null;
    const email = user?.email ?? null;

    const emailLocalPart = email?.split("@")[0]?.trim() ?? "";
    const fallbackUsername = baseProfile.username ?? (emailLocalPart || "User");

    const username =
      resolveLiveUsername(liveProfiles, userId, fallbackUsername) ?? fallbackUsername;

    const avatarUrl =
      resolveLiveAvatarUrl(liveProfiles, userId, baseProfile.avatarUrl) ??
      baseProfile.avatarUrl ??
      null;

    const avatarInitial = username.trim().charAt(0).toUpperCase() || "U";

    return {
      userId,
      email,
      username,
      avatarUrl,
      avatarInitial,
      loadingBaseProfile,
    };
  }, [baseProfile.avatarUrl, baseProfile.username, liveProfiles, loadingBaseProfile, user?.email, user?.id]);
}