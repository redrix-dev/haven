import React from 'react';
import { CHANNEL_BUNDLE_STALE_MS } from '@shared/app/constants';
import type { DirectMessageBackend } from '@shared/lib/backend/directMessageBackend';
import { useDmStore } from '@shared/stores/dmStore';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from '@shared/lib/backend/types';
import { getErrorMessage } from '@platform/lib/errors';

type RefreshDmConversationsOptions = { suppressLoadingState?: boolean };
type RefreshDmMessagesOptions = {
  suppressLoadingState?: boolean;
  markRead?: boolean;
  /** When true, only run mark-read side effects (no listMessages network call). */
  skipNetwork?: boolean;
};
type SendDirectMessageOptions = {
  imageBody?: Blob;
  /** Mobile / Hermes: prefer `imageArrayBuffer` + `imageContentType` over `imageBody`. */
  imageArrayBuffer?: ArrayBuffer;
  imageContentType?: string;
  imageFilename?: string;
  imageExpiresInHours?: number;
};

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
  const dmConversations = useDmStore((state) => state.conversations);
  const dmConversationsLoading = useDmStore((state) => state.isLoading);
  const [dmConversationsRefreshing, setDmConversationsRefreshing] = React.useState(false);
  const [dmConversationsError, setDmConversationsError] = React.useState<string | null>(null);
  const selectedDmConversationId = useDmStore((state) => state.currentConversationId);
  const [dmMessages, setDmMessages] = React.useState<DirectMessage[]>([]);
  const [dmMessagesLoading, setDmMessagesLoading] = React.useState(false);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = React.useState(false);
  const [dmMessagesError, setDmMessagesError] = React.useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = React.useState(false);

  const dmReadMarkInFlightRef = React.useRef<Record<string, boolean>>({});
  const dmLastReadMarkAtRef = React.useRef<Record<string, number>>({});
  const selectedDmConversationIdRef = React.useRef<string | null>(null);
  const dmMessagesCacheRef = React.useRef<Record<string, DirectMessage[]>>({});
  const dmLastSuccessfulFetchAtRef = React.useRef<Record<string, number>>({});

  const setStoredConversations = React.useCallback((conversations: DirectMessageConversationSummary[]) => {
    useDmStore.getState().setConversations(conversations);
  }, []);

  const setStoredCurrentConversationId = React.useCallback((conversationId: string | null) => {
    useDmStore.getState().setCurrentConversationId(conversationId);
  }, []);

  const setStoredCurrentConversation = React.useCallback(
    (conversation: DirectMessageConversationSummary | null) => {
      useDmStore.getState().setCurrentConversation(conversation);
    },
    []
  );

  const setStoredUnreadCounts = React.useCallback((unreadCounts: Record<string, number>) => {
    useDmStore.getState().setUnreadCounts(unreadCounts);
  }, []);

  const setStoredIsLoading = React.useCallback((isLoading: boolean) => {
    useDmStore.getState().setIsLoading(isLoading);
  }, []);

  const resetStoredDirectMessages = React.useCallback(() => {
    useDmStore.getState().reset();
  }, []);

  const syncStoredCurrentConversation = React.useCallback(
    (conversationId: string | null, conversations: DirectMessageConversationSummary[]) => {
      const nextCurrentConversation =
        conversationId
          ? conversations.find((conversation) => conversation.conversationId === conversationId) ?? null
          : null;
      setStoredCurrentConversation(nextCurrentConversation);
    },
    [setStoredCurrentConversation]
  );

  const commitDmConversations = React.useCallback(
    (conversations: DirectMessageConversationSummary[]) => {
      setStoredConversations(conversations);
      setStoredUnreadCounts(
        conversations.reduce<Record<string, number>>((next, conversation) => {
          next[conversation.conversationId] = conversation.unreadCount;
          return next;
        }, {})
      );
      syncStoredCurrentConversation(selectedDmConversationIdRef.current, conversations);
    },
    [setStoredConversations, setStoredUnreadCounts, syncStoredCurrentConversation]
  );

  const setSelectedDmConversationId = React.useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (value) => {
      const previousValue = selectedDmConversationIdRef.current;
      const nextValue =
        typeof value === 'function'
          ? (value as (previousState: string | null) => string | null)(previousValue)
          : value;
      selectedDmConversationIdRef.current = nextValue;
      setStoredCurrentConversationId(nextValue);
      syncStoredCurrentConversation(nextValue, useDmStore.getState().conversations);
    },
    [setStoredCurrentConversationId, syncStoredCurrentConversation]
  );

  const applyCachedDmMessages = React.useCallback((conversationId: string) => {
    const cachedMessages = dmMessagesCacheRef.current[conversationId];
    if (!cachedMessages) return false;
    if (selectedDmConversationIdRef.current !== conversationId) return false;

    setDmMessages(cachedMessages);
    setDmMessagesLoading(false);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
    return true;
  }, []);

  const resetDirectMessages = React.useCallback(() => {
    resetStoredDirectMessages();
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
    dmMessagesCacheRef.current = {};
    dmLastSuccessfulFetchAtRef.current = {};
  }, [resetStoredDirectMessages, setSelectedDmConversationId]);

  const clearSelectedDmConversation = React.useCallback(() => {
    setDmMessages([]);
    setSelectedDmConversationId(null);
    setDmMessagesLoading(false);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
  }, [setSelectedDmConversationId]);

  const refreshDmConversations = React.useCallback(
    async (options?: RefreshDmConversationsOptions) => {
      if (!userId || !enabled) {
        setStoredConversations([]);
        setStoredUnreadCounts({});
        setStoredCurrentConversation(null);
        return;
      }

      if (options?.suppressLoadingState) {
        setDmConversationsRefreshing(true);
      } else {
        setStoredIsLoading(true);
      }
      setDmConversationsError(null);

      try {
        const conversations = await directMessageBackend.listConversations();
        commitDmConversations(conversations);
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        setStoredIsLoading(false);
        setDmConversationsRefreshing(false);
      }
    },
    [
      commitDmConversations,
      directMessageBackend,
      enabled,
      setStoredConversations,
      setStoredCurrentConversation,
      setStoredIsLoading,
      setStoredUnreadCounts,
      userId,
    ]
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
        if (options?.skipNetwork) {
          if (selectedDmConversationIdRef.current !== conversationId) {
            return;
          }
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
          return;
        }

        const messages = await directMessageBackend.listMessages({
          conversationId,
          limit: 100,
        });
        dmMessagesCacheRef.current[conversationId] = messages;

        if (selectedDmConversationIdRef.current !== conversationId) {
          return;
        }
        setDmMessages(messages);
        dmLastSuccessfulFetchAtRef.current[conversationId] = Date.now();

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
        if (selectedDmConversationIdRef.current !== conversationId) return;
        setDmMessagesError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        if (selectedDmConversationIdRef.current !== conversationId) return;
        setDmMessagesLoading(false);
        setDmMessagesRefreshing(false);
      }
    },
    [directMessageBackend, enabled, userId]
  );

  React.useEffect(() => {
    let isMounted = true;

    if (!userId || !enabled) {
      setStoredConversations([]);
      setStoredUnreadCounts({});
      setStoredCurrentConversation(null);
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
  }, [
    enabled,
    refreshDmConversations,
    setSelectedDmConversationId,
    setStoredConversations,
    setStoredCurrentConversation,
    setStoredUnreadCounts,
    userId,
  ]);

  React.useEffect(() => {
    if (!isActive || !selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (conversation) => conversation.conversationId === selectedDmConversationId
    );
    if (!stillExists) {
      setSelectedDmConversationId(null);
    }
  }, [dmConversations, isActive, selectedDmConversationId, setSelectedDmConversationId]);

  React.useEffect(() => {
    syncStoredCurrentConversation(selectedDmConversationId, dmConversations);
  }, [dmConversations, selectedDmConversationId, syncStoredCurrentConversation]);

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

    const hasCachedMessages = applyCachedDmMessages(selectedDmConversationId);
    const lastFetch = dmLastSuccessfulFetchAtRef.current[selectedDmConversationId] ?? 0;
    const isFresh =
      lastFetch > 0 && Date.now() - lastFetch < CHANNEL_BUNDLE_STALE_MS;

    if (hasCachedMessages && isFresh) {
      return;
    }

    void refreshDmMessages(selectedDmConversationId, {
      suppressLoadingState: hasCachedMessages,
      markRead: false,
    }).catch((error) => {
      console.error('Failed to load selected DM conversation:', error);
    });
  }, [applyCachedDmMessages, isActive, refreshDmMessages, selectedDmConversationId, userId]);

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
      const hasCachedMessages = applyCachedDmMessages(conversationId);
      const lastFetch = dmLastSuccessfulFetchAtRef.current[conversationId] ?? 0;
      const isFresh =
        lastFetch > 0 && Date.now() - lastFetch < CHANNEL_BUNDLE_STALE_MS;

      if (!hasCachedMessages) {
        setDmMessages([]);
        setDmMessagesLoading(true);
        setDmMessagesRefreshing(false);
        setDmMessagesError(null);
      }

      if (hasCachedMessages && isFresh) {
        await refreshDmMessages(conversationId, {
          suppressLoadingState: true,
          markRead: true,
          skipNetwork: true,
        });
        return;
      }

      void refreshDmMessages(conversationId, {
        suppressLoadingState: hasCachedMessages,
        markRead: true,
      });

      const conversationExists = dmConversations.some(
        (conversation) => conversation.conversationId === conversationId
      );
      if (!conversationExists) {
        await refreshDmConversations({ suppressLoadingState: true });
      }
    },
    [
      applyCachedDmMessages,
      dmConversations,
      enabled,
      refreshDmConversations,
      refreshDmMessages,
      setSelectedDmConversationId,
      userId,
    ]
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
    async (content: string, options?: SendDirectMessageOptions) => {
      if (!selectedDmConversationId) {
        throw new Error('No direct message conversation selected.');
      }

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

        await directMessageBackend.sendMessage({
          conversationId: selectedDmConversationId,
          content,
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

  const selectedDmConversation = React.useMemo(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ?? null)
        : null,
    [dmConversations, selectedDmConversationId],
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
    derived: {
      /** Same as `isActive` input: DM workspace is visible. */
      showDmWorkspace: isActive,
      selectedDmConversation,
    },
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
