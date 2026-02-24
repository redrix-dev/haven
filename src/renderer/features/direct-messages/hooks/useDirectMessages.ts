import React from 'react';
import type { DirectMessageBackend } from '@/lib/backend/directMessageBackend';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';

type RefreshDmConversationsOptions = { suppressLoadingState?: boolean };
type RefreshDmMessagesOptions = { suppressLoadingState?: boolean; markRead?: boolean };

type UseDirectMessagesInput = {
  directMessageBackend: Pick<
    DirectMessageBackend,
    | 'listConversations'
    | 'getOrCreateDirectConversation'
    | 'listMessages'
    | 'sendMessage'
    | 'markConversationRead'
    | 'setConversationMuted'
    | 'reportMessage'
    | 'subscribeToConversations'
    | 'subscribeToMessages'
  >;
  userId: string | null | undefined;
  enabled: boolean;
  isActive: boolean;
};

export function useDirectMessages({
  directMessageBackend,
  userId,
  enabled,
  isActive,
}: UseDirectMessagesInput) {
  const [dmConversations, setDmConversations] = React.useState<DirectMessageConversationSummary[]>([]);
  const [dmConversationsLoading, setDmConversationsLoading] = React.useState(false);
  const [dmConversationsRefreshing, setDmConversationsRefreshing] = React.useState(false);
  const [dmConversationsError, setDmConversationsError] = React.useState<string | null>(null);
  const [selectedDmConversationId, setSelectedDmConversationId] = React.useState<string | null>(null);
  const [dmMessages, setDmMessages] = React.useState<DirectMessage[]>([]);
  const [dmMessagesLoading, setDmMessagesLoading] = React.useState(false);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = React.useState(false);
  const [dmMessagesError, setDmMessagesError] = React.useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = React.useState(false);

  const dmReadMarkInFlightRef = React.useRef<Record<string, boolean>>({});
  const dmLastReadMarkAtRef = React.useRef<Record<string, number>>({});

  const resetDirectMessages = React.useCallback(() => {
    setDmConversations([]);
    setDmConversationsLoading(false);
    setDmConversationsRefreshing(false);
    setDmConversationsError(null);
    setSelectedDmConversationId(null);
    setDmMessages([]);
    setDmMessagesLoading(false);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
    setDmMessageSendPending(false);
    dmReadMarkInFlightRef.current = {};
    dmLastReadMarkAtRef.current = {};
  }, []);

  const clearSelectedDmConversation = React.useCallback(() => {
    setDmMessages([]);
    setSelectedDmConversationId(null);
    setDmMessagesLoading(false);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
  }, []);

  const refreshDmConversations = React.useCallback(
    async (options?: RefreshDmConversationsOptions) => {
      if (!userId || !enabled) {
        setDmConversations([]);
        return;
      }

      if (options?.suppressLoadingState) {
        setDmConversationsRefreshing(true);
      } else {
        setDmConversationsLoading(true);
      }
      setDmConversationsError(null);

      try {
        const conversations = await directMessageBackend.listConversations();
        setDmConversations(conversations);
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        setDmConversationsLoading(false);
        setDmConversationsRefreshing(false);
      }
    },
    [directMessageBackend, enabled, userId]
  );

  const refreshDmMessages = React.useCallback(
    async (conversationId: string, options?: RefreshDmMessagesOptions) => {
      if (!userId || !enabled || !conversationId) {
        setDmMessages([]);
        return;
      }

      if (options?.suppressLoadingState) {
        setDmMessagesRefreshing(true);
      } else {
        setDmMessagesLoading(true);
      }
      setDmMessagesError(null);

      try {
        const messages = await directMessageBackend.listMessages({
          conversationId,
          limit: 100,
        });
        if (selectedDmConversationId !== conversationId) {
          return;
        }
        setDmMessages(messages);

        if (options?.markRead !== false) {
          const now = Date.now();
          const lastMarkedAt = dmLastReadMarkAtRef.current[conversationId] ?? 0;
          const recentlyMarked = now - lastMarkedAt < 1500;
          const inFlight = Boolean(dmReadMarkInFlightRef.current[conversationId]);
          if (!recentlyMarked && !inFlight) {
            dmReadMarkInFlightRef.current[conversationId] = true;
            try {
              await directMessageBackend.markConversationRead(conversationId);
              dmLastReadMarkAtRef.current[conversationId] = Date.now();
            } finally {
              dmReadMarkInFlightRef.current[conversationId] = false;
            }
          }
        }
      } catch (error) {
        if (selectedDmConversationId !== conversationId) return;
        setDmMessagesError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        if (selectedDmConversationId !== conversationId) return;
        setDmMessagesLoading(false);
        setDmMessagesRefreshing(false);
      }
    },
    [directMessageBackend, enabled, selectedDmConversationId, userId]
  );

  React.useEffect(() => {
    let isMounted = true;

    if (!userId || !enabled) {
      setDmConversations([]);
      setSelectedDmConversationId(null);
      return () => {
        isMounted = false;
      };
    }

    void refreshDmConversations().catch((error) => {
      if (!isMounted) return;
      console.error('Failed to initialize DM conversations:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [enabled, refreshDmConversations, userId]);

  React.useEffect(() => {
    if (!isActive) return;
    if (selectedDmConversationId) {
      const stillExists = dmConversations.some(
        (conversation) => conversation.conversationId === selectedDmConversationId
      );
      if (!stillExists) {
        setSelectedDmConversationId(dmConversations[0]?.conversationId ?? null);
      }
      return;
    }

    if (dmConversations.length > 0) {
      setSelectedDmConversationId(dmConversations[0].conversationId);
    }
  }, [dmConversations, isActive, selectedDmConversationId]);

  React.useEffect(() => {
    if (!userId || !enabled) return;

    const subscription = directMessageBackend.subscribeToConversations(userId, () => {
      void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
        console.error('Failed to refresh DM conversations after realtime update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [directMessageBackend, enabled, refreshDmConversations, userId]);

  React.useEffect(() => {
    if (!isActive || !selectedDmConversationId || !userId) {
      setDmMessages([]);
      setDmMessagesLoading(false);
      setDmMessagesRefreshing(false);
      setDmMessagesError(null);
      return;
    }

    void refreshDmMessages(selectedDmConversationId, { markRead: true }).catch((error) => {
      console.error('Failed to load selected DM conversation:', error);
    });
  }, [isActive, refreshDmMessages, selectedDmConversationId, userId]);

  React.useEffect(() => {
    if (!isActive || !selectedDmConversationId) return;

    const subscription = directMessageBackend.subscribeToMessages(selectedDmConversationId, () => {
      void refreshDmMessages(selectedDmConversationId, {
        suppressLoadingState: true,
        markRead: false,
      }).catch((error) => {
        console.error('Failed to refresh DM messages after realtime update:', error);
      });
      void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
        console.error('Failed to refresh DM conversations after message update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [directMessageBackend, isActive, refreshDmConversations, refreshDmMessages, selectedDmConversationId]);

  const openDirectMessageConversation = React.useCallback(
    async (conversationId: string) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }
      if (!enabled) {
        throw new Error('Direct messages are not enabled for your account.');
      }
      if (!conversationId) {
        throw new Error('DM conversation id is required.');
      }

      setSelectedDmConversationId(conversationId);
      await refreshDmConversations({ suppressLoadingState: true });
      await refreshDmMessages(conversationId, { suppressLoadingState: true, markRead: true });
    },
    [enabled, refreshDmConversations, refreshDmMessages, userId]
  );

  const openDirectMessageWithUser = React.useCallback(
    async (targetUserId: string) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }
      if (!enabled) {
        throw new Error('Direct messages are not enabled for your account.');
      }

      const conversationId = await directMessageBackend.getOrCreateDirectConversation(targetUserId);
      await openDirectMessageConversation(conversationId);
    },
    [directMessageBackend, enabled, openDirectMessageConversation, userId]
  );

  const sendDirectMessage = React.useCallback(
    async (content: string) => {
      if (!selectedDmConversationId) {
        throw new Error('No direct message conversation selected.');
      }

      setDmMessageSendPending(true);
      setDmMessagesError(null);
      try {
        await directMessageBackend.sendMessage({
          conversationId: selectedDmConversationId,
          content,
        });
        await Promise.all([
          refreshDmMessages(selectedDmConversationId, { suppressLoadingState: true, markRead: false }),
          refreshDmConversations({ suppressLoadingState: true }),
        ]);
      } catch (error) {
        const message = getErrorMessage(error, 'Failed to send direct message.');
        console.error('Failed to send direct message:', error);
        setDmMessagesError(message);
        throw new Error(message);
      } finally {
        setDmMessageSendPending(false);
      }
    },
    [directMessageBackend, refreshDmConversations, refreshDmMessages, selectedDmConversationId]
  );

  const toggleSelectedDmConversationMuted = React.useCallback(
    async (nextMuted: boolean) => {
      if (!selectedDmConversationId) {
        throw new Error('No direct message conversation selected.');
      }

      await directMessageBackend.setConversationMuted({
        conversationId: selectedDmConversationId,
        muted: nextMuted,
      });
      await refreshDmConversations({ suppressLoadingState: true });
    },
    [directMessageBackend, refreshDmConversations, selectedDmConversationId]
  );

  const reportDirectMessage = React.useCallback(
    async (input: { messageId: string; kind: DirectMessageReportKind; comment: string }) => {
      await directMessageBackend.reportMessage(input);
    },
    [directMessageBackend]
  );

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
    },
    derived: {},
    actions: {
      resetDirectMessages,
      clearSelectedDmConversation,
      refreshDmConversations,
      refreshDmMessages,
      setSelectedDmConversationId,
      setDmConversationsError,
      setDmMessagesError,
      openDirectMessageConversation,
      openDirectMessageWithUser,
      sendDirectMessage,
      toggleSelectedDmConversationMuted,
      reportDirectMessage,
    },
  };
}
