import { useEffect } from "react";
import { useHavenCore } from "@shared/core";

type UseChatAppElevationEffectsInput = {
  currentServerId: string | null;
  userId: string | undefined;
  activeVoiceCommunityId: string | null;
  setIsCurrentUserElevatedInCurrentServer: (value: boolean) => void;
  setIsCurrentUserElevatedInActiveVoiceServer: (value: boolean) => void;
  setIsCurrentUserElevatedInMembersModalServer: (value: boolean) => void;
};

export function useChatAppElevationEffects({
  currentServerId,
  userId,
  activeVoiceCommunityId,
  setIsCurrentUserElevatedInCurrentServer,
  setIsCurrentUserElevatedInActiveVoiceServer,
  setIsCurrentUserElevatedInMembersModalServer,
}: UseChatAppElevationEffectsInput) {
  const core = useHavenCore();
  const membersModalCommunityId =
    core.admin.useMembersModalState().membersModalCommunityId;

  // Reset local elevation flags when the active server changes.
  // PermissionsNexus tracks elevation per-community and handles its own cache.
  useEffect(() => {
    setIsCurrentUserElevatedInCurrentServer(false);
    setIsCurrentUserElevatedInActiveVoiceServer(false);
    setIsCurrentUserElevatedInMembersModalServer(false);
  }, [
    currentServerId,
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

    void core
      .ensureElevated(currentServerId)
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
    core,
    currentServerId,
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

    void core
      .ensureElevated(activeVoiceCommunityId)
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
    core,
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

    void core
      .ensureElevated(membersModalCommunityId)
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
    core,
    membersModalCommunityId,
    setIsCurrentUserElevatedInMembersModalServer,
    userId,
  ]);
}
