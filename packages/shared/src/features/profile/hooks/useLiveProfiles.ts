import React from 'react';
import type { ControlPlaneBackend } from '@shared/lib/backend/controlPlaneBackend';
import { mapLiveProfileIdentity } from '@shared/lib/backend/controlPlaneBackend';
import type { LiveProfileIdentity } from '@shared/lib/backend/types';
import { useLiveProfilesStore } from '@shared/stores/liveProfilesStore';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getEventType = (payload: unknown): 'INSERT' | 'UPDATE' | 'DELETE' | null => {
  const eventType = asRecord(payload)?.eventType;
  return eventType === 'INSERT' || eventType === 'UPDATE' || eventType === 'DELETE' ? eventType : null;
};

const getRow = (payload: unknown, key: 'new' | 'old'): LiveProfileIdentity | null => {
  const row = asRecord(asRecord(payload)?.[key]);
  const userId = typeof row?.user_id === 'string' ? row.user_id : null;
  const username = typeof row?.username === 'string' ? row.username : null;
  const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : null;

  if (!userId || !username || !updatedAt) return null;

  return mapLiveProfileIdentity({
    user_id: userId,
    username,
    avatar_url: typeof row?.avatar_url === 'string' ? row.avatar_url : null,
    updated_at: updatedAt,
  });
};

type UseLiveProfilesInput = {
  controlPlaneBackend: Pick<ControlPlaneBackend, 'subscribeToProfileIdentities'>;
  userId: string | null | undefined;
};

export function useLiveProfiles({ controlPlaneBackend, userId }: UseLiveProfilesInput) {
  const upsertProfile = React.useCallback((profile: LiveProfileIdentity) => {
    useLiveProfilesStore.getState().upsertProfile(profile);
  }, []);

  const upsertProfiles = React.useCallback((profiles: LiveProfileIdentity[]) => {
    useLiveProfilesStore.getState().upsertProfiles(profiles);
  }, []);

  const removeProfile = React.useCallback((targetUserId: string) => {
    useLiveProfilesStore.getState().removeProfile(targetUserId);
  }, []);

  const resetLiveProfiles = React.useCallback(() => {
    useLiveProfilesStore.getState().reset();
  }, []);

  React.useEffect(() => {
    if (!userId) {
      resetLiveProfiles();
      return;
    }

    const subscription = controlPlaneBackend.subscribeToProfileIdentities((payload) => {
      const eventType = getEventType(payload);
      if (eventType === 'DELETE') {
        const deletedProfile = getRow(payload, 'old');
        if (!deletedProfile) return;
        removeProfile(deletedProfile.userId);
        return;
      }

      const nextProfile = getRow(payload, 'new');
      if (!nextProfile) return;
      upsertProfile(nextProfile);
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [controlPlaneBackend, removeProfile, resetLiveProfiles, upsertProfile, userId]);

  return {
    actions: {
      upsertProfile,
      upsertProfiles,
      removeProfile,
      resetLiveProfiles,
    },
  };
}
