import React from 'react';
import { toast } from 'sonner';
import type { SocialBackend } from '@/lib/backend/socialBackend';
import type { DirectMessageConversationSummary } from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

type UseDirectMessageInteractionsInput = {
  dmWorkspaceEnabled: boolean;
  friendsSocialPanelEnabled: boolean;
  currentUserId: string | null | undefined;
  selectedDmConversationId: string | null;
  dmConversations: DirectMessageConversationSummary[];
  setSelectedDmConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setDmConversationsError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshDmConversations: (options?: { suppressLoadingState?: boolean }) => Promise<void>;
  openDirectMessageWithUser: (targetUserId: string) => Promise<void>;
  clearSelectedDmConversation: () => void;
  socialBackend: Pick<SocialBackend, 'blockUser'>;
  refreshSocialCounts: () => Promise<void>;
  refreshNotificationInbox: (options?: { playSoundsForNew?: boolean }) => Promise<void>;
  onOpenDmWorkspace: () => void;
  onEnterDmWorkspace: () => void;
  onOpenFriendsAddPanel: () => void;
};

export function useDirectMessageInteractions({
  dmWorkspaceEnabled,
  friendsSocialPanelEnabled,
  currentUserId,
  selectedDmConversationId,
  dmConversations,
  setSelectedDmConversationId,
  setDmConversationsError,
  refreshDmConversations,
  openDirectMessageWithUser,
  clearSelectedDmConversation,
  socialBackend,
  refreshSocialCounts,
  refreshNotificationInbox,
  onOpenDmWorkspace,
  onEnterDmWorkspace,
  onOpenFriendsAddPanel,
}: UseDirectMessageInteractionsInput) {
  const openDirectMessagesWorkspace = React.useCallback(() => {
    if (!dmWorkspaceEnabled) {
      const message = 'Direct messages are not enabled for your account.';
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-workspace-disabled' });
      return;
    }

    onOpenDmWorkspace();
    setDmConversationsError(null);

    if (!selectedDmConversationId && dmConversations.length > 0) {
      setSelectedDmConversationId(dmConversations[0].conversationId);
    }

    void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
      const message = getErrorMessage(error, 'Failed to load direct messages.');
      console.error('Failed to open direct messages workspace:', error);
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-workspace-open-error' });
    });
  }, [
    dmConversations,
    dmWorkspaceEnabled,
    onOpenDmWorkspace,
    refreshDmConversations,
    selectedDmConversationId,
    setDmConversationsError,
    setSelectedDmConversationId,
  ]);

  const directMessageUser = React.useCallback(
    (targetUserId: string) => {
      setDmConversationsError(null);

      if (!dmWorkspaceEnabled) {
        const message = 'Direct messages are coming soon.';
        setDmConversationsError(message);
        toast.error(message, { id: 'dm-open-disabled' });
        return;
      }

      if (!targetUserId) {
        const message = 'Invalid DM target.';
        setDmConversationsError(message);
        toast.error(message, { id: 'dm-open-invalid-target' });
        return;
      }

      if (currentUserId && targetUserId === currentUserId) {
        const message = 'You cannot direct message yourself.';
        setDmConversationsError(message);
        toast.error(message, { id: 'dm-open-self' });
        return;
      }

      onEnterDmWorkspace();
      void openDirectMessageWithUser(targetUserId).catch((error) => {
        const message = getErrorMessage(error, 'Failed to open direct message.');
        const errorCode =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof (error as { code?: unknown }).code === 'string'
            ? ((error as { code: string }).code ?? null)
            : null;

        console.error('Failed to open direct message:', error);
        setDmConversationsError(message);

        if (errorCode === 'P0001' && message.includes('friends list')) {
          toast.error(message, {
            id: 'dm-open-friends-only',
            action: friendsSocialPanelEnabled
              ? {
                  label: 'Open Friends',
                  onClick: onOpenFriendsAddPanel,
                }
              : undefined,
          });
          return;
        }

        toast.error(message, { id: 'dm-open-error' });
      });
    },
    [
      currentUserId,
      dmWorkspaceEnabled,
      friendsSocialPanelEnabled,
      onEnterDmWorkspace,
      onOpenFriendsAddPanel,
      openDirectMessageWithUser,
      setDmConversationsError,
    ]
  );

  const blockDirectMessageUser = React.useCallback(
    async (input: { userId: string; username: string }) => {
      await socialBackend.blockUser(input.userId);
      clearSelectedDmConversation();

      await Promise.all([
        refreshSocialCounts(),
        refreshDmConversations({ suppressLoadingState: true }),
        refreshNotificationInbox({ playSoundsForNew: false }),
      ]);
    },
    [
      clearSelectedDmConversation,
      refreshDmConversations,
      refreshNotificationInbox,
      refreshSocialCounts,
      socialBackend,
    ]
  );

  return {
    state: {},
    derived: {},
    actions: {
      openDirectMessagesWorkspace,
      directMessageUser,
      blockDirectMessageUser,
    },
  };
}
