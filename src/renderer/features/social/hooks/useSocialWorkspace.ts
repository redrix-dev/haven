import React from 'react';
import type { SocialBackend } from '@/lib/backend/socialBackend';
import type { SocialCounts } from '@/lib/backend/types';
import type { FriendsPanelTab } from '@/renderer/app/types';
import { DEFAULT_SOCIAL_COUNTS } from '@/renderer/app/constants';

type UseSocialWorkspaceInput = {
  socialBackend: Pick<SocialBackend, 'getSocialCounts' | 'subscribeToSocialGraph'>;
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

  const resetSocialWorkspace = React.useCallback(() => {
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
    setSocialCounts(DEFAULT_SOCIAL_COUNTS);
  }, []);

  const refreshSocialCounts = React.useCallback(async () => {
    if (!userId || !enabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      return;
    }

    const nextCounts = await socialBackend.getSocialCounts();
    setSocialCounts(nextCounts);
  }, [enabled, socialBackend, userId]);

  React.useEffect(() => {
    let isMounted = true;

    if (!userId || !enabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      return () => {
        isMounted = false;
      };
    }

    void refreshSocialCounts().catch((error) => {
      if (!isMounted) return;
      console.error('Failed to load social counts:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [enabled, refreshSocialCounts, userId]);

  React.useEffect(() => {
    if (!userId || !enabled) return;

    const subscription = socialBackend.subscribeToSocialGraph(userId, () => {
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
    },
    derived: {},
    actions: {
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setFriendsPanelHighlightedRequestId,
      setSocialCounts,
      refreshSocialCounts,
      resetSocialWorkspace,
    },
  };
}
