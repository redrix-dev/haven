import React from 'react';
import { useHavenCore } from '@shared/core';
import type { DirectMessageReportKind } from '@shared/lib/backend/types';
import { getErrorMessage } from '@platform/lib/errors';

type RefreshDmConversationsOptions = { suppressLoadingState?: boolean };
type RefreshDmMessagesOptions = {
  suppressLoadingState?: boolean;
  markRead?: boolean;
};
type SendDirectMessageOptions = {
  imageBody?: Blob;
  imageArrayBuffer?: ArrayBuffer;
  imageContentType?: string;
  imageFilename?: string;
  imageExpiresInHours?: number;
};

type UseDirectMessagesInput = {
  userId: string | null | undefined;
  enabled: boolean;
  isActive: boolean;
};

export function useDirectMessages({
  userId,
  enabled,
  isActive,
}: UseDirectMessagesInput) {
  const core = useHavenCore();
  const dm = core.directMessages;

  const dmConversations = dm.useConversations();
  const dmConversationsLoading = dm.useIsLoadingConversations();
  const selectedDmConversationId = dm.useActiveConversationId();
  const messageConversationKey =
    enabled && isActive && selectedDmConversationId ? selectedDmConversationId : '';
  const dmMessages = dm.useMessages(messageConversationKey);
  const dmMessagesLoading = dm.useIsLoadingMessages(messageConversationKey);

  const [dmConversationsRefreshing, setDmConversationsRefreshing] = React.useState(false);
  const [dmConversationsError, setDmConversationsError] = React.useState<string | null>(null);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = React.useState(false);
  const [dmMessagesError, setDmMessagesError] = React.useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = React.useState(false);
  const [dmComposeDraftPeer, setDmComposeDraftPeer] = React.useState<{
    userId: string;
    displayName: string;
  } | null>(null);

  const setSelectedDmConversationId = React.useCallback(
    (value: React.SetStateAction<string | null>) => {
      const next =
        typeof value === 'function'
          ? (value as (previousState: string | null) => string | null)(
              selectedDmConversationId,
            )
          : value;
      dm.setActiveConversationId(next);
    },
    [dm, selectedDmConversationId],
  );

  const refreshDmConversations = React.useCallback(
    async (options?: RefreshDmConversationsOptions) => {
      if (!userId || !enabled) return;
      if (options?.suppressLoadingState) setDmConversationsRefreshing(true);
      setDmConversationsError(null);
      try {
        await dm.loadConversations();
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        setDmConversationsRefreshing(false);
      }
    },
    [dm, enabled, userId],
  );

  const refreshDmMessages = React.useCallback(
    async (conversationId: string, options?: RefreshDmMessagesOptions) => {
      if (!userId || !enabled || !conversationId) return;
      if (options?.suppressLoadingState) setDmMessagesRefreshing(true);
      setDmMessagesError(null);
      try {
        await dm.loadMessages(conversationId);
        if (options?.markRead !== false) {
          await dm.markRead(conversationId);
        }
      } catch (error) {
        setDmMessagesError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        setDmMessagesRefreshing(false);
      }
    },
    [dm, enabled, userId],
  );

  React.useEffect(() => {
    if (!userId || !enabled) {
      dm.setActiveConversationId(null);
      setDmComposeDraftPeer(null);
    }
  }, [dm, enabled, userId]);

  React.useEffect(() => {
    if (!isActive || !selectedDmConversationId || !userId || !enabled) return;
    void refreshDmMessages(selectedDmConversationId, { markRead: false }).catch((error) => {
      console.error('Failed to load selected DM conversation:', error);
    });
  }, [enabled, isActive, refreshDmMessages, selectedDmConversationId, userId]);

  React.useEffect(() => {
    if (!isActive || !selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (conversation) => conversation.conversationId === selectedDmConversationId,
    );
    if (!stillExists) dm.setActiveConversationId(null);
  }, [dm, dmConversations, isActive, selectedDmConversationId]);

  const openDirectMessageConversation = React.useCallback(
    async (conversationId: string) => {
      if (!userId) throw new Error('Not authenticated.');
      if (!enabled) throw new Error('Direct messages are not enabled for your account.');
      if (!conversationId) throw new Error('DM conversation id is required.');

      setDmComposeDraftPeer(null);
      dm.setActiveConversationId(conversationId);
      await refreshDmMessages(conversationId, { markRead: true });

      const conversationExists = dmConversations.some(
        (conversation) => conversation.conversationId === conversationId,
      );
      if (!conversationExists) {
        await refreshDmConversations({ suppressLoadingState: true });
      }
    },
    [dm, dmConversations, enabled, refreshDmConversations, refreshDmMessages, userId],
  );

  const openDirectMessageDraftWithUser = React.useCallback(
    (targetUserId: string, displayName?: string | null) => {
      if (!userId) throw new Error('Not authenticated.');
      if (!enabled) throw new Error('Direct messages are not enabled for your account.');

      const existing = dmConversations.find((c) => c.otherUserId === targetUserId);
      if (existing) {
        void openDirectMessageConversation(existing.conversationId);
        return;
      }

      setDmComposeDraftPeer({
        userId: targetUserId,
        displayName: displayName?.trim() || 'Direct',
      });
      dm.setActiveConversationId(null);
    },
    [dm, dmConversations, enabled, openDirectMessageConversation, userId],
  );

  const openDirectMessageWithUser = React.useCallback(
    async (targetUserId: string) => {
      if (!userId) throw new Error('Not authenticated.');
      if (!enabled) throw new Error('Direct messages are not enabled for your account.');
      const conversationId = await dm.getOrCreateDirectConversation(targetUserId);
      await openDirectMessageConversation(conversationId);
    },
    [dm, enabled, openDirectMessageConversation, userId],
  );

  const sendDirectMessage = React.useCallback(
    async (content: string, options?: SendDirectMessageOptions) => {
      let activeConversationId = selectedDmConversationId;
      const draftPeer = dmComposeDraftPeer;
      if (!activeConversationId && draftPeer) {
        activeConversationId = await dm.getOrCreateDirectConversation(draftPeer.userId);
        setDmComposeDraftPeer(null);
        dm.setActiveConversationId(activeConversationId);
        await refreshDmConversations({ suppressLoadingState: true });
      }
      if (!activeConversationId) throw new Error('No direct message conversation selected.');

      setDmMessageSendPending(true);
      setDmMessagesError(null);
      try {
        const hasBlob = options?.imageBody != null;
        const hasBuffer = options?.imageArrayBuffer != null;
        if (hasBlob && hasBuffer) {
          throw new Error('Cannot send both imageBody and imageArrayBuffer.');
        }
        if (hasBuffer && !options.imageContentType?.trim()) {
          throw new Error('imageContentType is required when sending imageArrayBuffer.');
        }
        const inferredFilename =
          options?.imageFilename ??
          (options?.imageBody && 'name' in options.imageBody
            ? String(options.imageBody.name)
            : undefined) ??
          `upload-${Date.now()}`;

        await dm.sendMessage(activeConversationId, content, {
          imageUpload: hasBuffer
            ? {
                body: options.imageArrayBuffer as ArrayBuffer,
                filename: inferredFilename,
                expiresInHours: options.imageExpiresInHours,
                contentType: options.imageContentType?.trim(),
              }
            : hasBlob
              ? {
                  body: options.imageBody as Blob,
                  filename: inferredFilename,
                  expiresInHours: options.imageExpiresInHours,
                }
              : undefined,
        });
      } catch (error) {
        const message = getErrorMessage(error, 'Failed to send direct message.');
        setDmMessagesError(message);
        throw new Error(message);
      } finally {
        setDmMessageSendPending(false);
      }
    },
    [
      dm,
      dmComposeDraftPeer,
      refreshDmConversations,
      selectedDmConversationId,
    ],
  );

  const selectedDmConversation = React.useMemo(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ?? null)
        : null,
    [dmConversations, selectedDmConversationId],
  );

  const resetDirectMessages = React.useCallback(() => {
    dm.setActiveConversationId(null);
    setDmComposeDraftPeer(null);
    setDmConversationsRefreshing(false);
    setDmConversationsError(null);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
    setDmMessageSendPending(false);
  }, [dm]);

  return {
    state: {
      dmConversations,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmConversationsError,
      selectedDmConversationId,
      dmMessages,
      dmMessagesLoading,
      dmMessagesRefreshing,
      dmMessagesError,
      dmMessageSendPending,
      dmComposeDraftPeer,
    },
    derived: {
      showDmWorkspace: isActive,
      selectedDmConversation,
    },
    actions: {
      resetDirectMessages,
      clearSelectedDmConversation: () => {
        setDmComposeDraftPeer(null);
        dm.setActiveConversationId(null);
        setDmMessagesError(null);
      },
      refreshDmConversations,
      refreshDmMessages,
      setSelectedDmConversationId,
      setDmConversationsError,
      setDmMessagesError,
      openDirectMessageConversation,
      openDirectMessageDraftWithUser,
      openDirectMessageWithUser,
      sendDirectMessage,
      toggleSelectedDmConversationMuted: async (nextMuted: boolean) => {
        if (!selectedDmConversationId) {
          throw new Error('No direct message conversation selected.');
        }
        await dm.setMuted(selectedDmConversationId, nextMuted);
        await refreshDmConversations({ suppressLoadingState: true });
      },
      reportDirectMessage: async (input: {
        messageId: string;
        kind: DirectMessageReportKind;
        comment: string;
      }) => {
        await core.backends.directMessages.reportMessage(input);
      },
      clearDirectMessageDraft: () => {
        setDmComposeDraftPeer(null);
        setDmMessagesError(null);
      },
    },
  };
}
