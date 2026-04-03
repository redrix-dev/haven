import React from 'react';
import type { SocialBackend } from '@shared/lib/backend/socialBackend';
import type { SocialCounts } from '@shared/lib/backend/types';
import type { FriendsPanelTab } from '@shared/app/types';
import { DEFAULT_SOCIAL_COUNTS } from '@shared/app/constants';
import { useSocialStore } from '@shared/stores/socialStore';

type UseSocialWorkspaceInput = {
  socialBackend: Pick<
    SocialBackend,
    | 'getSocialCounts'
    | 'listMyBlocks'
    | 'listUsersBlockingMe'
    | 'subscribeToSocialGraph'
  >;
  userId: string | null | undefined;
  enabled: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getRealtimeEventType = (payload: unknown): 'INSERT' | 'UPDATE' | 'DELETE' | null => {
  const eventType = asRecord(payload)?.eventType;
  return eventType === 'INSERT' || eventType === 'UPDATE' || eventType === 'DELETE' ? eventType : null;
};

const getRealtimeTableName = (payload: unknown): string | null => {
  const table = asRecord(payload)?.table;
  return typeof table === 'string' ? table : null;
};

const getRealtimeNewRow = (payload: unknown): Record<string, unknown> | null =>
  asRecord(asRecord(payload)?.new);

const getRealtimeOldRow = (payload: unknown): Record<string, unknown> | null =>
  asRecord(asRecord(payload)?.old);

export function useSocialWorkspace({ socialBackend, userId, enabled }: UseSocialWorkspaceInput) {
  const [friendsPanelOpen, setFriendsPanelOpen] = React.useState(false);
  const [friendsPanelRequestedTab, setFriendsPanelRequestedTab] = React.useState<FriendsPanelTab | null>(
    null
  );
  const [friendsPanelHighlightedRequestId, setFriendsPanelHighlightedRequestId] =
    React.useState<string | null>(null);
  const [socialCounts, setSocialCounts] = React.useState<SocialCounts>(DEFAULT_SOCIAL_COUNTS);

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
    if (!userId || !enabled) return;

    const subscription = socialBackend.subscribeToSocialGraph(userId, (payload) => {
      if (getRealtimeTableName(payload) === 'user_blocks') {
        const eventType = getRealtimeEventType(payload);
        const nextRow = getRealtimeNewRow(payload);
        const oldRow = getRealtimeOldRow(payload);
        const blockerUserId =
          (typeof nextRow?.blocker_user_id === 'string' ? nextRow.blocker_user_id : null) ??
          (typeof oldRow?.blocker_user_id === 'string' ? oldRow.blocker_user_id : null);
        const blockedUserId =
          (typeof nextRow?.blocked_user_id === 'string' ? nextRow.blocked_user_id : null) ??
          (typeof oldRow?.blocked_user_id === 'string' ? oldRow.blocked_user_id : null);

        if (eventType === 'INSERT') {
          if (blockerUserId === userId && blockedUserId) {
            addStoredMyBlockedUserId(blockedUserId);
          }
          if (blockedUserId === userId && blockerUserId) {
            addStoredUserBlockingMeId(blockerUserId);
          }
        }

        if (eventType === 'DELETE') {
          if (blockerUserId === userId && blockedUserId) {
            removeStoredMyBlockedUserId(blockedUserId);
          }
          if (blockedUserId === userId && blockerUserId) {
            removeStoredUserBlockingMeId(blockerUserId);
          }
        } // CHECKPOINT 3 COMPLETE
      }

      void refreshSocialCounts().catch((error) => {
        console.error('Failed to refresh social counts after realtime update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [
    addStoredMyBlockedUserId,
    addStoredUserBlockingMeId,
    enabled,
    refreshSocialCounts,
    removeStoredMyBlockedUserId,
    removeStoredUserBlockingMeId,
    socialBackend,
    userId,
  ]);

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
