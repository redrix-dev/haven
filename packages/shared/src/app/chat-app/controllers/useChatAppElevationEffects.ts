import { useEffect, type MutableRefObject } from "react";

type UseChatAppElevationEffectsInput = {
  currentServerId: string | null;
  userId: string | undefined;
  activeVoiceCommunityId: string | null;
  membersModalCommunityId: string | null;
  ensureIsElevatedInServer: (communityId: string) => Promise<boolean>;
  elevatedCacheRef: MutableRefObject<Map<string, boolean>>;
  setIsCurrentUserElevatedInCurrentServer: (value: boolean) => void;
  setIsCurrentUserElevatedInActiveVoiceServer: (value: boolean) => void;
  setIsCurrentUserElevatedInMembersModalServer: (value: boolean) => void;
};

export function useChatAppElevationEffects({
  currentServerId,
  userId,
  activeVoiceCommunityId,
  membersModalCommunityId,
  ensureIsElevatedInServer,
  elevatedCacheRef,
  setIsCurrentUserElevatedInCurrentServer,
  setIsCurrentUserElevatedInActiveVoiceServer,
  setIsCurrentUserElevatedInMembersModalServer,
}: UseChatAppElevationEffectsInput) {
  useEffect(() => {
    elevatedCacheRef.current.clear();
    setIsCurrentUserElevatedInCurrentServer(false);
    setIsCurrentUserElevatedInActiveVoiceServer(false);
    setIsCurrentUserElevatedInMembersModalServer(false);
  }, [
    currentServerId,
    elevatedCacheRef,
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

    void ensureIsElevatedInServer(currentServerId)
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
    ensureIsElevatedInServer,
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

    void ensureIsElevatedInServer(activeVoiceCommunityId)
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
    ensureIsElevatedInServer,
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

    void ensureIsElevatedInServer(membersModalCommunityId)
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
    ensureIsElevatedInServer,
    membersModalCommunityId,
    setIsCurrentUserElevatedInMembersModalServer,
    userId,
  ]);
}
