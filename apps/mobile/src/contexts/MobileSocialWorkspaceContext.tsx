import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type { SocialCounts } from "@shared/lib/backend/types";
import type { FriendsPanelTab } from "@shared/types/types";

type SocialHookReturn = {
  state: {
    friendsPanelOpen: boolean;
    friendsPanelRequestedTab: FriendsPanelTab | null;
    friendsPanelHighlightedRequestId: string | null;
    socialCounts: SocialCounts;
  };
  derived: Record<string, never>;
  actions: {
    setFriendsPanelOpen: (open: boolean) => void;
    setFriendsPanelRequestedTab: (tab: FriendsPanelTab | null) => void;
    setFriendsPanelHighlightedRequestId: (id: string | null) => void;
    refreshSocialCounts: () => Promise<void>;
    resetSocialWorkspace: () => void;
  };
};

const MobileSocialWorkspaceContext = createContext<SocialHookReturn | null>(null);

export function MobileSocialWorkspaceProvider({
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const core = useHavenCore();
  const friendsPanelOpen = useUiStore((state) => state.friendsPanelOpen);
  const friendsPanelRequestedTab = useUiStore(
    (state) => state.friendsPanelRequestedTab,
  );
  const friendsPanelHighlightedRequestId = useUiStore(
    (state) => state.friendsPanelHighlightedRequestId,
  );
  const setFriendsPanelOpen = useUiStore((state) => state.setFriendsPanelOpen);
  const setFriendsPanelRequestedTab = useUiStore(
    (state) => state.setFriendsPanelRequestedTab,
  );
  const setFriendsPanelHighlightedRequestId = useUiStore(
    (state) => state.setFriendsPanelHighlightedRequestId,
  );
  const socialCounts = core.social.useCounts();

  const refreshSocialCounts = useCallback(async () => {
    await core.social.load();
  }, [core]);

  const resetSocialWorkspace = useCallback(() => {
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
  }, [
    setFriendsPanelHighlightedRequestId,
    setFriendsPanelOpen,
    setFriendsPanelRequestedTab,
  ]);

  const value: SocialHookReturn = {
    state: {
      friendsPanelOpen,
      friendsPanelRequestedTab,
      friendsPanelHighlightedRequestId,
      socialCounts,
    },
    derived: {},
    actions: {
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setFriendsPanelHighlightedRequestId,
      refreshSocialCounts,
      resetSocialWorkspace,
    },
  };

  return (
    <MobileSocialWorkspaceContext.Provider value={value}>
      {children}
    </MobileSocialWorkspaceContext.Provider>
  );
}

export function useMobileSocialWorkspace(): SocialHookReturn {
  const ctx = useContext(MobileSocialWorkspaceContext);
  if (!ctx) {
    throw new Error("useMobileSocialWorkspace requires MobileSocialWorkspaceProvider.");
  }
  return ctx;
}
