import React from 'react';
import type { ControlPlaneBackend } from '@/lib/backend/controlPlaneBackend';

type UsePlatformSessionInput = {
  controlPlaneBackend: Pick<ControlPlaneBackend, 'fetchUserProfile' | 'fetchPlatformStaff'>;
  userId: string | null | undefined;
  userEmail: string | null | undefined;
};

export function usePlatformSession({
  controlPlaneBackend,
  userId,
  userEmail,
}: UsePlatformSessionInput) {
  const [profileUsername, setProfileUsername] = React.useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState<string | null>(null);
  const [isPlatformStaff, setIsPlatformStaff] = React.useState(false);
  const [platformStaffPrefix, setPlatformStaffPrefix] = React.useState<string | null>(null);
  const [canPostHavenDevMessage, setCanPostHavenDevMessage] = React.useState(false);

  const resetPlatformSession = React.useCallback(() => {
    setProfileUsername('');
    setProfileAvatarUrl(null);
    setIsPlatformStaff(false);
    setPlatformStaffPrefix(null);
    setCanPostHavenDevMessage(false);
  }, []);

  const applyLocalProfileUpdate = React.useCallback((values: { username: string; avatarUrl: string | null }) => {
    setProfileUsername(values.username);
    setProfileAvatarUrl(values.avatarUrl);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId) {
      resetPlatformSession();
      return () => {
        isMounted = false;
      };
    }

    const fallbackUsername = userEmail?.split('@')[0] || 'User';

    const loadProfile = async () => {
      const [profileResult, staffResult] = await Promise.allSettled([
        controlPlaneBackend.fetchUserProfile(userId),
        controlPlaneBackend.fetchPlatformStaff(userId),
      ]);

      if (!isMounted) return;

      if (profileResult.status === 'rejected') {
        console.error('Error loading profile:', profileResult.reason);
        setProfileUsername(fallbackUsername);
        setProfileAvatarUrl(null);
      } else {
        const profile = profileResult.value;
        setProfileUsername(profile?.username ?? fallbackUsername);
        setProfileAvatarUrl(profile?.avatarUrl ?? null);
      }

      if (staffResult.status === 'rejected') {
        console.error('Error loading platform staff info:', staffResult.reason);
        setIsPlatformStaff(false);
        setPlatformStaffPrefix(null);
        setCanPostHavenDevMessage(false);
      } else {
        const staff = staffResult.value;
        const activeStaff = Boolean(staff?.isActive);
        setIsPlatformStaff(activeStaff);
        setPlatformStaffPrefix(staff?.displayPrefix ?? null);
        setCanPostHavenDevMessage(Boolean(staff?.isActive && staff?.canPostHavenDev));
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [controlPlaneBackend, resetPlatformSession, userEmail, userId]);

  return {
    state: {
      profileUsername,
      profileAvatarUrl,
      isPlatformStaff,
      platformStaffPrefix,
      canPostHavenDevMessage,
    },
    derived: {},
    actions: {
      resetPlatformSession,
      applyLocalProfileUpdate,
    },
  };
}
