import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import { MESSAGE_PAGE_SIZE } from '@/renderer/app/constants';
import type { ChannelMessageBundleCacheEntry } from '@/renderer/app/types';
import type {
  Channel,
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from '@/lib/backend/types';

type UseMessagesInput = {
  currentServerId: string | null;
  currentChannelId: string | null;
  currentUserId: string | null;
  channels: Channel[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageReactions: React.Dispatch<React.SetStateAction<MessageReaction[]>>;
  setMessageAttachments: React.Dispatch<React.SetStateAction<MessageAttachment[]>>;
  setMessageLinkPreviews: React.Dispatch<React.SetStateAction<MessageLinkPreview[]>>;
};

export function useMessages({
  currentServerId,
  currentChannelId,
  currentUserId,
  channels,
  setMessages,
  setMessageReactions,
  setMessageAttachments,
  setMessageLinkPreviews,
}: UseMessagesInput) {
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = React.useState(false);
  const requestOlderMessagesRef = React.useRef<(() => Promise<void>) | null>(null);
  const messageBundleByChannelCacheRef = React.useRef<Record<string, ChannelMessageBundleCacheEntry>>({});
  const latestLoadIdRef = React.useRef(0);
  const olderLoadInFlightRef = React.useRef(false);
  const currentHasOlderMessagesRef = React.useRef(false);
  const oldestLoadedCursorRef = React.useRef<{ createdAt: string; id: string } | null>(null);

  const getChannelBundleCacheKey = React.useCallback(
    (communityId: string, channelId: string) => `${communityId}:${channelId}`,
    []
  );

  const getCachedChannelBundle = React.useCallback(
    (communityId: string, channelId: string): ChannelMessageBundleCacheEntry | null => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      return messageBundleByChannelCacheRef.current[cacheKey] ?? null;
    },
    [getChannelBundleCacheKey]
  );

  const cacheChannelBundle = React.useCallback(
    (communityId: string, channelId: string, bundle: ChannelMessageBundleCacheEntry) => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      messageBundleByChannelCacheRef.current[cacheKey] = bundle;
    },
    [getChannelBundleCacheKey]
  );

  const setRequestOlderMessagesLoader = React.useCallback(
    (loader: (() => Promise<void>) | null) => {
      requestOlderMessagesRef.current = loader;
    },
    []
  );

  const clearRequestOlderMessagesLoader = React.useCallback(() => {
    requestOlderMessagesRef.current = null;
  }, []);

  const requestOlderMessages = React.useCallback(async () => {
    const loader = requestOlderMessagesRef.current;
    if (!loader) return;
    await loader();
  }, []);

  const getMessageLoadRuntime = React.useCallback(
    () => ({
      latestLoadId: latestLoadIdRef.current,
      olderLoadInFlight: olderLoadInFlightRef.current,
      hasOlderMessages: currentHasOlderMessagesRef.current,
      oldestLoadedCursor: oldestLoadedCursorRef.current,
    }),
    []
  );

  const createNextMessageLoadId = React.useCallback(() => {
    latestLoadIdRef.current += 1;
    return latestLoadIdRef.current;
  }, []);

  const isCurrentMessageLoad = React.useCallback((loadId: number) => latestLoadIdRef.current === loadId, []);

  const syncOldestLoadedCursor = React.useCallback((messageList: Message[]) => {
    oldestLoadedCursorRef.current =
      messageList.length > 0 ? { createdAt: messageList[0].created_at, id: messageList[0].id } : null;
  }, []);

  const syncLoadedMessageWindow = React.useCallback(
    (messageList: Message[], hasOlder: boolean) => {
      currentHasOlderMessagesRef.current = hasOlder;
      oldestLoadedCursorRef.current =
        messageList.length > 0 ? { createdAt: messageList[0].created_at, id: messageList[0].id } : null;
      setHasOlderMessages(hasOlder);
    },
    []
  );

  const tryBeginOlderMessagesLoad = React.useCallback(() => {
    if (olderLoadInFlightRef.current) return null;
    if (!currentHasOlderMessagesRef.current || !oldestLoadedCursorRef.current) return null;

    olderLoadInFlightRef.current = true;
    setIsLoadingOlderMessages(true);
    latestLoadIdRef.current += 1;

    return {
      loadId: latestLoadIdRef.current,
      oldestLoadedCursor: oldestLoadedCursorRef.current,
    };
  }, []);

  const finishOlderMessagesLoad = React.useCallback((options?: { updateUi?: boolean }) => {
    olderLoadInFlightRef.current = false;
    if (options?.updateUi === false) return;
    setIsLoadingOlderMessages(false);
  }, []);

  const resetMessagePagination = React.useCallback(() => {
    latestLoadIdRef.current = 0;
    olderLoadInFlightRef.current = false;
    currentHasOlderMessagesRef.current = false;
    oldestLoadedCursorRef.current = null;
    setHasOlderMessages(false);
    setIsLoadingOlderMessages(false);
    requestOlderMessagesRef.current = null;
  }, []);

  const resetMessageState = React.useCallback(() => {
    setMessages([]);
    setMessageReactions([]);
    setMessageAttachments([]);
    setMessageLinkPreviews([]);
    latestLoadIdRef.current = 0;
    olderLoadInFlightRef.current = false;
    currentHasOlderMessagesRef.current = false;
    oldestLoadedCursorRef.current = null;
    setHasOlderMessages(false);
    setIsLoadingOlderMessages(false);
    requestOlderMessagesRef.current = null;
  }, [setMessageAttachments, setMessageLinkPreviews, setMessageReactions, setMessages]);

  const sendMessage = React.useCallback(
    async (
      content: string,
      options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
    ) => {
      if (!currentUserId || !currentChannelId || !currentServerId) return;

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.sendUserMessage({
        communityId: currentServerId,
        channelId: currentChannelId,
        userId: currentUserId,
        content,
        replyToMessageId: options?.replyToMessageId,
        mediaUpload: options?.mediaFile
          ? {
              file: options.mediaFile,
              expiresInHours: options.mediaExpiresInHours,
            }
          : undefined,
      });
    },
    [currentChannelId, currentServerId, currentUserId]
  );

  const toggleMessageReaction = React.useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.toggleMessageReaction({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageId,
        emoji,
      });
    },
    [currentChannelId, currentServerId]
  );

  const editMessage = React.useCallback(
    async (messageId: string, content: string) => {
      if (!currentServerId) throw new Error('No server selected.');
      const trimmedContent = content.trim();
      if (!trimmedContent) throw new Error('Message content is required.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.editUserMessage({
        communityId: currentServerId,
        messageId,
        content: trimmedContent,
      });
    },
    [currentServerId]
  );

  const deleteMessage = React.useCallback(
    async (messageId: string) => {
      if (!currentServerId) throw new Error('No server selected.');

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.deleteMessage({
        communityId: currentServerId,
        messageId,
      });
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      setMessageReactions((prev) => prev.filter((reaction) => reaction.messageId !== messageId));
      setMessageAttachments((prev) => prev.filter((attachment) => attachment.messageId !== messageId));
      setMessageLinkPreviews((prev) => prev.filter((preview) => preview.messageId !== messageId));
    },
    [
      currentServerId,
      setMessageAttachments,
      setMessageLinkPreviews,
      setMessageReactions,
      setMessages,
    ]
  );

  const reportMessage = React.useCallback(
    async (input: {
      messageId: string;
      target: MessageReportTarget;
      kind: MessageReportKind;
      comment: string;
    }) => {
      if (!currentUserId || !currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.reportMessage({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageId: input.messageId,
        reporterUserId: currentUserId,
        target: input.target,
        kind: input.kind,
        comment: input.comment,
      });
    },
    [currentChannelId, currentServerId, currentUserId]
  );

  const requestMessageLinkPreviewRefresh = React.useCallback(
    async (messageId: string) => {
      if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

      const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
      if (!selectedChannel || selectedChannel.kind !== 'text') {
        throw new Error('Link previews can only be refreshed in text channels.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.requestChannelLinkPreviewBackfill({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: [messageId],
      });
    },
    [channels, currentChannelId, currentServerId]
  );

  const fetchLatestMessageWindow = React.useCallback(
    async (targetCount: number) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      const boundedTargetCount = Math.max(Math.floor(targetCount), MESSAGE_PAGE_SIZE);
      let beforeCursor: { createdAt: string; id: string } | null = null;
      let aggregatedMessages: Message[] = [];
      let hasMore = false;

      while (aggregatedMessages.length < boundedTargetCount) {
        const remaining = boundedTargetCount - aggregatedMessages.length;
        const page = await communityBackend.listMessagesPage({
          communityId: currentServerId,
          channelId: currentChannelId,
          beforeCursor,
          limit: Math.min(MESSAGE_PAGE_SIZE, remaining),
        });

        if (page.messages.length === 0) {
          hasMore = false;
          break;
        }

        aggregatedMessages = [...page.messages, ...aggregatedMessages];
        hasMore = page.hasMore;

        if (!page.hasMore) {
          break;
        }

        const nextOldest = page.messages[0];
        beforeCursor = nextOldest ? { createdAt: nextOldest.created_at, id: nextOldest.id } : null;
        if (!beforeCursor) break;
      }

      return { messageList: aggregatedMessages, hasMore };
    },
    [currentChannelId, currentServerId]
  );

  const fetchMessagesPageBeforeCursor = React.useCallback(
    async (beforeCursor: { createdAt: string; id: string }, limit = MESSAGE_PAGE_SIZE) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.listMessagesPage({
        communityId: currentServerId,
        channelId: currentChannelId,
        beforeCursor,
        limit: Math.max(1, Math.floor(limit)),
      });
    },
    [currentChannelId, currentServerId]
  );

  const fetchRelatedForMessages = React.useCallback(
    async (messageList: Message[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const messageIds = messageList.map((message) => message.id);
      if (messageIds.length === 0) {
        return {
          reactionList: [] as MessageReaction[],
          attachmentList: [] as MessageAttachment[],
          linkPreviewList: [] as MessageLinkPreview[],
        };
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      const [reactionList, attachmentList, linkPreviewList] = await Promise.all([
        communityBackend.listMessageReactionsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
        communityBackend.listMessageAttachmentsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
        communityBackend.listMessageLinkPreviewsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
      ]);

      return { reactionList, attachmentList, linkPreviewList };
    },
    [currentChannelId, currentServerId]
  );

  const fetchMessageAttachmentsForMessageIds = React.useCallback(
    async (messageIds: string[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
      if (uniqueMessageIds.length === 0) {
        return [] as MessageAttachment[];
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.listMessageAttachmentsForMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: uniqueMessageIds,
      });
    },
    [currentChannelId, currentServerId]
  );

  const fetchMessageLinkPreviewsForMessageIds = React.useCallback(
    async (messageIds: string[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error('No channel selected.');
      }

      const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
      if (uniqueMessageIds.length === 0) {
        return [] as MessageLinkPreview[];
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.listMessageLinkPreviewsForMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: uniqueMessageIds,
      });
    },
    [currentChannelId, currentServerId]
  );

  const runMessageMediaMaintenance = React.useCallback(
    async (limit = 100) => {
      if (!currentServerId) {
        throw new Error('No server selected.');
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.runMessageMediaMaintenance(limit);
    },
    [currentServerId]
  );

  const loadLatestMessagesWithRelated = React.useCallback(
    async (currentMessageCount: number) => {
      const loadId = createNextMessageLoadId();
      const startedAt = Date.now();
      const targetCount = Math.max(currentMessageCount, MESSAGE_PAGE_SIZE);
      const { messageList, hasMore } = await fetchLatestMessageWindow(targetCount);
      const { reactionList, attachmentList, linkPreviewList } = await fetchRelatedForMessages(messageList);

      return {
        loadId,
        startedAt,
        messageList,
        reactionList,
        attachmentList,
        linkPreviewList,
        hasOlder: hasMore,
      };
    },
    [createNextMessageLoadId, fetchLatestMessageWindow, fetchRelatedForMessages]
  );

  const loadOlderMessagesWithRelated = React.useCallback(
    async (currentMessageList: Message[]) => {
      const olderLoad = tryBeginOlderMessagesLoad();
      if (!olderLoad) {
        return { kind: 'skipped' as const };
      }

      const { loadId, oldestLoadedCursor } = olderLoad;
      const startedAt = Date.now();

      const page = await fetchMessagesPageBeforeCursor(oldestLoadedCursor, MESSAGE_PAGE_SIZE);

      if (page.messages.length === 0) {
        return {
          kind: 'no_more' as const,
          loadId,
          startedAt,
          oldestLoadedCursor,
        };
      }

      const existingIds = new Set(currentMessageList.map((message) => message.id));
      const prependMessages = page.messages.filter((message) => !existingIds.has(message.id));
      const nextMessageList = [...prependMessages, ...currentMessageList];
      const { reactionList, attachmentList, linkPreviewList } = await fetchRelatedForMessages(nextMessageList);

      return {
        kind: 'loaded' as const,
        loadId,
        startedAt,
        oldestLoadedCursor,
        prependCount: prependMessages.length,
        messageList: nextMessageList,
        reactionList,
        attachmentList,
        linkPreviewList,
        hasOlder: page.hasMore,
      };
    },
    [
      fetchMessagesPageBeforeCursor,
      fetchRelatedForMessages,
      tryBeginOlderMessagesLoad,
    ]
  );

  return {
    state: {
      hasOlderMessages,
      isLoadingOlderMessages,
    },
    derived: {},
    actions: {
      setHasOlderMessages, // temporary compatibility for incremental extraction
      setIsLoadingOlderMessages, // temporary compatibility for incremental extraction
      setRequestOlderMessagesLoader, // temporary compatibility for incremental extraction
      clearRequestOlderMessagesLoader,
      getMessageLoadRuntime, // temporary compatibility for incremental extraction
      createNextMessageLoadId, // temporary compatibility for incremental extraction
      isCurrentMessageLoad, // temporary compatibility for incremental extraction
      syncOldestLoadedCursor, // temporary compatibility for incremental extraction
      syncLoadedMessageWindow, // temporary compatibility for incremental extraction
      tryBeginOlderMessagesLoad, // temporary compatibility for incremental extraction
      finishOlderMessagesLoad, // temporary compatibility for incremental extraction
      resetMessagePagination,
      resetMessageState,
      getCachedChannelBundle, // temporary compatibility for incremental extraction
      cacheChannelBundle, // temporary compatibility for incremental extraction
      fetchLatestMessageWindow, // temporary compatibility for incremental extraction
      fetchMessagesPageBeforeCursor, // temporary compatibility for incremental extraction
      fetchRelatedForMessages, // temporary compatibility for incremental extraction
      fetchMessageAttachmentsForMessageIds, // temporary compatibility for incremental extraction
      fetchMessageLinkPreviewsForMessageIds, // temporary compatibility for incremental extraction
      runMessageMediaMaintenance, // temporary compatibility for incremental extraction
      loadLatestMessagesWithRelated, // temporary compatibility for incremental extraction
      loadOlderMessagesWithRelated, // temporary compatibility for incremental extraction
      requestOlderMessages,
      sendMessage,
      toggleMessageReaction,
      editMessage,
      deleteMessage,
      reportMessage,
      requestMessageLinkPreviewRefresh,
    },
  };
}
