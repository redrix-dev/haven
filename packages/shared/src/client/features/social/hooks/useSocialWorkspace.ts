import React from 'react';
import type { SocialBackend } from '@shared/lib/backend/socialBackend';
import type { SocialCounts } from '@shared/lib/backend/types';
import type { FriendsPanelTab } from '@client/app/types';
import { DEFAULT_SOCIAL_COUNTS } from '@client/app/constants';

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

const addUniqueUserId = (existingUserIds: string[], userId: string): string[] => {
  if (!userId || existingUserIds.includes(userId)) return existingUserIds;
  return [...existingUserIds, userId];
};

const removeUserId = (existingUserIds: string[], userId: string): string[] =>
  existingUserIds.filter((existingUserId) => existingUserId !== userId);

export function useSocialWorkspace({ socialBackend, userId, enabled }: UseSocialWorkspaceInput) {
  const [friendsPanelOpen, setFriendsPanelOpen] = React.useState(false);
  const [friendsPanelRequestedTab, setFriendsPanelRequestedTab] = React.useState<FriendsPanelTab | null>(
    null
  );
  const [friendsPanelHighlightedRequestId, setFriendsPanelHighlightedRequestId] =
    React.useState<string | null>(null);
  const [socialCounts, setSocialCounts] = React.useState<SocialCounts>(DEFAULT_SOCIAL_COUNTS);
  const [myBlockedUserIds, setMyBlockedUserIds] = React.useState<string[]>([]);
  const [usersBlockingMeIds, setUsersBlockingMeIds] = React.useState<string[]>([]);

  const blockedUserIds = React.useMemo(
    () => new Set([...myBlockedUserIds, ...usersBlockingMeIds]),
    [myBlockedUserIds, usersBlockingMeIds]
  );

  const resetSocialWorkspace = React.useCallback(() => {
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
    setSocialCounts(DEFAULT_SOCIAL_COUNTS);
    setMyBlockedUserIds([]);
    setUsersBlockingMeIds([]);
  }, []);

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
      setMyBlockedUserIds([]);
      setUsersBlockingMeIds([]);
      return;
    }

    const [nextMyBlockedUserIds, nextUsersBlockingMeIds] = await Promise.all([
      socialBackend.listMyBlocks(),
      socialBackend.listUsersBlockingMe(),
    ]);
    setMyBlockedUserIds(nextMyBlockedUserIds);
    setUsersBlockingMeIds(nextUsersBlockingMeIds);
  }, [enabled, socialBackend, userId]);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId || !enabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      setMyBlockedUserIds([]);
      setUsersBlockingMeIds([]);
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
  }, [enabled, refreshBlockLists, refreshSocialCounts, userId]);

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
            setMyBlockedUserIds((existingUserIds) => addUniqueUserId(existingUserIds, blockedUserId));
          }
          if (blockedUserId === userId && blockerUserId) {
            setUsersBlockingMeIds((existingUserIds) => addUniqueUserId(existingUserIds, blockerUserId));
          }
        }

        if (eventType === 'DELETE') {
          if (blockerUserId === userId && blockedUserId) {
            setMyBlockedUserIds((existingUserIds) => removeUserId(existingUserIds, blockedUserId));
          }
          if (blockedUserId === userId && blockerUserId) {
            setUsersBlockingMeIds((existingUserIds) => removeUserId(existingUserIds, blockerUserId));
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
  }, [enabled, refreshSocialCounts, socialBackend, userId]);

  return {
    state: {
      friendsPanelOpen,
      friendsPanelRequestedTab,
      friendsPanelHighlightedRequestId,
      socialCounts,
      blockedUserIds,
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
