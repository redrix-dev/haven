import * as React from 'react';

const STORAGE_KEY = 'haven:voice-member-volumes';

export function useVoiceMemberVolumes() {
  const [remoteVolumes, setRemoteVolumes] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteVolumes));
  }, [remoteVolumes]);

  const resetMemberVolume = React.useCallback((userId: string) => {
    setRemoteVolumes((prev) => ({ ...prev, [userId]: 100 }));
  }, []);

  const resetAllMemberVolumes = React.useCallback(() => {
    setRemoteVolumes({});
  }, []);

  return { remoteVolumes, setRemoteVolumes, resetMemberVolume, resetAllMemberVolumes };
}
