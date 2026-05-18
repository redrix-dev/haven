import React from 'react';
import type { SocialBackend } from '@shared/lib/backend/socialBackend';
import type { SocialCounts } from '@shared/lib/backend/types';
import type { FriendsPanelTab } from '@shared/types/types';
import { DEFAULT_SOCIAL_COUNTS } from '@shared/infrastructure/constants';
import { useSocialStore } from '@shared/stores/socialStore';
import { useSocialGraphRealtimeStore } from '@shared/stores/socialGraphRealtimeStore';

type UseSocialWorkspaceInput = {
  socialBackend: Pick<
    SocialBackend,
    'getSocialCounts' | 'listMyBlocks' | 'listUsersBlockingMe'
  >;
  userId: string | null | undefined;
  enabled: boolean;
};

export function useSocialWorkspace({ socialBackend, userId, enabled }: UseSocialWorkspaceInput) {
  const [friendsPanelOpen, setFriendsPanelOpen] = React.useState(false);
  const [friendsPanelRequestedTab, setFriendsPanelRequestedTab] = React.useState<FriendsPanelTab | null>(
    null
  );
  const [friendsPanelHighlightedRequestId, setFriendsPanelHighlightedRequestId] =
    React.useState<string | null>(null);
  const [socialCounts, setSocialCounts] = React.useState<SocialCounts>(DEFAULT_SOCIAL_COUNTS);

  const socialRefreshTrigger = useSocialStore((state) => state.socialRefreshTrigger);
  const lastSocialPayload = useSocialStore((state) => state.lastSocialPayload);

  const setStoredBlockLists = React.useCallback(
    (input: { myBlockedUserIds: string[]; usersBlockingMeIds: string[] }) => {
      useSocialStore.getState().setBlockLists(input);
    },
    []
  );

  const addStoredMyBlockedUserId = React.useCallback((blockedUserId: string) => {
    useSocialStore.getState().addMyBlockedUserId(blockedUserId);
  }, []);

  const removeStoredMyBlockedUserId = React.useCallback((blockedUserId: string) => {
    useSocialStore.getState().removeMyBlockedUserId(blockedUserId);
  }, []);

  const addStoredUserBlockingMeId = React.useCallback((blockerUserId: string) => {
    useSocialStore.getState().addUserBlockingMeId(blockerUserId);
  }, []);

  const removeStoredUserBlockingMeId = React.useCallback((blockerUserId: string) => {
    useSocialStore.getState().removeUserBlockingMeId(blockerUserId);
  }, []);

  const resetStoredBlockLists = React.useCallback(() => {
    useSocialStore.getState().reset();
  }, []);

  const resetSocialWorkspace = React.useCallback(() => {
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
    setSocialCounts(DEFAULT_SOCIAL_COUNTS);
    resetStoredBlockLists();
  }, [resetStoredBlockLists]);

  const refreshSocialCounts = React.useCallback(async () => {
    if (!userId || !enabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      return;
    }

    const nextCounts = await socialBackend.getSocialCounts();
    setSocialCounts(nextCounts);
  }, [enabled, socialBackend, userId]);

  const refreshBlockLists = React.useCallback(async () => {
    if (!userId || !enabled) {
      resetStoredBlockLists();
      return;
    }

    const [nextMyBlockedUserIds, nextUsersBlockingMeIds] = await Promise.all([
      socialBackend.listMyBlocks(),
      socialBackend.listUsersBlockingMe(),
    ]);
    setStoredBlockLists({
      myBlockedUserIds: nextMyBlockedUserIds,
      usersBlockingMeIds: nextUsersBlockingMeIds,
    });
  }, [enabled, resetStoredBlockLists, setStoredBlockLists, socialBackend, userId]);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId || !enabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      resetStoredBlockLists();
      return () => {
        isMounted = false;
      };
    }

    void Promise.all([refreshSocialCounts(), refreshBlockLists()]).catch((error) => {
      if (!isMounted) return;
      console.error('Failed to load social workspace state:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [enabled, refreshBlockLists, refreshSocialCounts, resetStoredBlockLists, userId]);

  React.useEffect(() => {
    if (socialRefreshTrigger === 0) return;

    const payload = lastSocialPayload;
    const eventType = typeof payload?.event_type === 'string'
      ? payload.event_type : null;
    const blockerUserId = typeof payload?.blocker_user_id === 'string'
      ? payload.blocker_user_id : null;
    const blockedUserId = typeof payload?.blocked_user_id === 'string'
      ? payload.blocked_user_id : null;

    if (blockerUserId && blockedUserId) {
      if (eventType === 'INSERT') {
        if (blockerUserId === userId) addStoredMyBlockedUserId(blockedUserId);
        if (blockedUserId === userId) addStoredUserBlockingMeId(blockerUserId);
      }
      if (eventType === 'DELETE') {
        if (blockerUserId === userId) removeStoredMyBlockedUserId(blockedUserId);
        if (blockedUserId === userId) removeStoredUserBlockingMeId(blockerUserId);
      }
    }

    useSocialGraphRealtimeStore.getState().bump();

    void refreshSocialCounts().catch((error) => {
      console.error('Failed to refresh social counts after realtime update:', error);
    });
    // Intentionally only `socialRefreshTrigger`: `lastSocialPayload` is read when the counter changes, not when the payload reference updates alone.
  }, [socialRefreshTrigger]);

  return {
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
      setSocialCounts,
      refreshSocialCounts,
      refreshBlockLists,
      resetSocialWorkspace,
    },
  };
}
