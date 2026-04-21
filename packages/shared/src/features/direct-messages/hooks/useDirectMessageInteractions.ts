import React from 'react';
import type { SocialBackend } from '@shared/lib/backend/socialBackend';
import { getErrorMessage } from '@platform/lib/errors';

type DirectMessageNotifier = (
  level: "error" | "success",
  message: string,
  options?: {
    id?: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
) => void;

type UseDirectMessageInteractionsInput = {
  currentUserId: string | null | undefined;
  setDmConversationsError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshDmConversations: (options?: { suppressLoadingState?: boolean }) => Promise<void>;
  openDirectMessageWithUser: (targetUserId: string) => Promise<void>;
  socialBackend: Pick<SocialBackend, 'blockUser'>;
  refreshSocialCounts: () => Promise<void>;
  refreshNotificationInbox: (options?: { playSoundsForNew?: boolean }) => Promise<void>;
  onOpenDmWorkspace: () => void;
  onEnterDmWorkspace: () => void;
  onOpenFriendsAddPanel: () => void;
  notify?: DirectMessageNotifier;
};

export function useDirectMessageInteractions({
  currentUserId,
  setDmConversationsError,
  refreshDmConversations,
  openDirectMessageWithUser,
  socialBackend,
  refreshSocialCounts,
  refreshNotificationInbox,
  onOpenDmWorkspace,
  onEnterDmWorkspace,
  onOpenFriendsAddPanel,
  notify,
}: UseDirectMessageInteractionsInput) {
  const openDirectMessagesWorkspace = React.useCallback(() => {
    onOpenDmWorkspace();
    setDmConversationsError(null);

    void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
      const message = getErrorMessage(error, 'Failed to load direct messages.');
      console.error('Failed to open direct messages workspace:', error);
      setDmConversationsError(message);
      notify?.("error", message, { id: 'dm-workspace-open-error' });
    });
  }, [notify, onOpenDmWorkspace, refreshDmConversations, setDmConversationsError]);

  const directMessageUser = React.useCallback(
    (targetUserId: string) => {
      setDmConversationsError(null);

      if (!targetUserId) {
        const message = 'Invalid DM target.';
        setDmConversationsError(message);
        notify?.("error", message, { id: 'dm-open-invalid-target' });
        return;
      }

      if (currentUserId && targetUserId === currentUserId) {
        const message = 'You cannot direct message yourself.';
        setDmConversationsError(message);
        notify?.("error", message, { id: 'dm-open-self' });
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
          notify?.("error", message, {
            id: 'dm-open-friends-only',
            action: {
              label: 'Open Friends',
              onClick: onOpenFriendsAddPanel,
            },
          });
          return;
        }

        notify?.("error", message, { id: 'dm-open-error' });
      });
    },
    [
      currentUserId,
      onEnterDmWorkspace,
      onOpenFriendsAddPanel,
      openDirectMessageWithUser,
      setDmConversationsError,
      notify,
    ]
  );

  const blockDirectMessageUser = React.useCallback(
    async (input: { userId: string; username: string }) => {
      await socialBackend.blockUser(input.userId);

      await Promise.all([
        refreshSocialCounts(),
        refreshDmConversations({ suppressLoadingState: true }),
        refreshNotificationInbox({ playSoundsForNew: false }),
      ]);
    },
    [
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
