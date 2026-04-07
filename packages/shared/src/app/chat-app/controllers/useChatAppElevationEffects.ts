import { useEffect } from "react";
import { usePermissionsStore } from "@shared/stores/permissionsStore";

type UseChatAppElevationEffectsInput = {
  currentServerId: string | null;
  userId: string | undefined;
  activeVoiceCommunityId: string | null;
  membersModalCommunityId: string | null;
  setIsCurrentUserElevatedInCurrentServer: (value: boolean) => void;
  setIsCurrentUserElevatedInActiveVoiceServer: (value: boolean) => void;
  setIsCurrentUserElevatedInMembersModalServer: (value: boolean) => void;
};

export function useChatAppElevationEffects({
  currentServerId,
  userId,
  activeVoiceCommunityId,
  membersModalCommunityId,
  setIsCurrentUserElevatedInCurrentServer,
  setIsCurrentUserElevatedInActiveVoiceServer,
  setIsCurrentUserElevatedInMembersModalServer,
}: UseChatAppElevationEffectsInput) {
  const ensureElevatedInServer = usePermissionsStore(
    (s) => s.ensureElevatedInServer,
  );
  const invalidateAllElevated = usePermissionsStore(
    (s) => s.invalidateAllElevated,
  );

  useEffect(() => {
    invalidateAllElevated();
    setIsCurrentUserElevatedInCurrentServer(false);
    setIsCurrentUserElevatedInActiveVoiceServer(false);
    setIsCurrentUserElevatedInMembersModalServer(false);
  }, [
    currentServerId,
    invalidateAllElevated,
    setIsCurrentUserElevatedInActiveVoiceServer,
    setIsCurrentUserElevatedInCurrentServer,
    setIsCurrentUserElevatedInMembersModalServer,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!currentServerId || !userId) {
      setIsCurrentUserElevatedInCurrentServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureElevatedInServer(currentServerId, userId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInCurrentServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(
          "Failed to resolve elevated current server status:",
          error,
        );
        setIsCurrentUserElevatedInCurrentServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentServerId,
    ensureElevatedInServer,
    setIsCurrentUserElevatedInCurrentServer,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!activeVoiceCommunityId || !userId) {
      setIsCurrentUserElevatedInActiveVoiceServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureElevatedInServer(activeVoiceCommunityId, userId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInActiveVoiceServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to resolve elevated voice server status:", error);
        setIsCurrentUserElevatedInActiveVoiceServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeVoiceCommunityId,
    ensureElevatedInServer,
    setIsCurrentUserElevatedInActiveVoiceServer,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!membersModalCommunityId || !userId) {
      setIsCurrentUserElevatedInMembersModalServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureElevatedInServer(membersModalCommunityId, userId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInMembersModalServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(
          "Failed to resolve elevated members modal status:",
          error,
        );
        setIsCurrentUserElevatedInMembersModalServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    ensureElevatedInServer,
    membersModalCommunityId,
    setIsCurrentUserElevatedInMembersModalServer,
    userId,
  ]);
}
