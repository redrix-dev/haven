import React, { useRef } from "react";
import { getCommunityDataBackend } from "@shared/lib/backend";
import { MESSAGE_PAGE_SIZE } from "@client/app/constants";
import type { ChannelMessageBundleCacheEntry } from "@client/app/types";
import {
  applyChannelAccessVisibilityToMessageBundle,
  filterBlockedUserContent,
} from "@client/features/messages/lib/banVisibility";
import { useMessagesStore } from "@shared/stores/messagesStore";
import type {
  AuthorProfile,
  Channel,
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { asRecord } from "@platform/lib/records";
import { useUserStatusStore } from "@shared/stores/userStatusStore";

const MESSAGE_RELOAD_FRESHNESS_WINDOW_MS = 10_000;

const getStringField = (value: unknown, key: string): string | null => {
  const record = asRecord(value);
  if (!record) return null;
  const candidate = record[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
};

const getNullableStringField = (value: unknown, key: string): string | null => {
  const record = asRecord(value);
  if (!record) return null;
  const candidate = record[key];
  if (candidate == null) return null;
  return typeof candidate === "string" ? candidate : null;
};

const getRealtimeEventType = (
  payload: unknown,
): "INSERT" | "UPDATE" | "DELETE" | null => {
  const eventType = getStringField(payload, "eventType");
  if (
    eventType === "INSERT" ||
    eventType === "UPDATE" ||
    eventType === "DELETE"
  )
    return eventType;
  return null;
};

const getRealtimeNewRow = (payload: unknown): Record<string, unknown> | null =>
  asRecord(asRecord(payload)?.new);

const getRealtimeOldRow = (payload: unknown): Record<string, unknown> | null =>
  asRecord(asRecord(payload)?.old);

const compareMessagesAsc = (left: Message, right: Message): number => {
  if (left.created_at < right.created_at) return -1;
  if (left.created_at > right.created_at) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
};

const parseReactionFromRow = (
  row: Record<string, unknown> | null,
): MessageReaction | null => {
  if (!row) return null;
  const id = getStringField(row, "id");
  const messageId = getStringField(row, "message_id");
  const userId = getStringField(row, "user_id");
  const emoji = getStringField(row, "emoji");
  const createdAt = getStringField(row, "created_at");
  if (!id || !messageId || !userId || !emoji || !createdAt) return null;
  return { id, messageId, userId, emoji, createdAt };
};

type IncrementalMessageApplyInput = {
  payload: unknown;
  currentMessageList: Message[];
  currentReactionList: MessageReaction[];
  currentAttachmentList: MessageAttachment[];
  currentLinkPreviewList: MessageLinkPreview[];
  commitMessages: (nextMessages: Message[], reason: string) => void;
  commitReactions: (nextReactions: MessageReaction[]) => void;
  commitAttachments: (nextAttachments: MessageAttachment[]) => void;
  commitLinkPreviews: (nextLinkPreviews: MessageLinkPreview[]) => void;
};

type IncrementalReactionApplyInput = {
  payload: unknown;
  currentMessageList: Message[];
  currentReactionList: MessageReaction[];
  commitReactions: (nextReactions: MessageReaction[]) => void;
};

type SubscribeToMessageRealtimeStreamsInput = {
  onMessagePayload: (payload: unknown) => void;
  onReactionPayload: (payload: unknown) => void;
  onAttachmentPayload: (payload: unknown) => void;
  onLinkPreviewPayload: (payload: unknown) => void;
};

type IncrementalRelatedRefreshQueuesInput = {
  isMounted: () => boolean;
  getCurrentMessageList: () => Message[];
  getCurrentAttachmentList: () => MessageAttachment[];
  getCurrentLinkPreviewList: () => MessageLinkPreview[];
  commitAttachments: (nextAttachments: MessageAttachment[]) => void;
  commitLinkPreviews: (nextLinkPreviews: MessageLinkPreview[]) => void;
  onAttachmentRefreshFallback: (error: unknown) => void;
  onLinkPreviewRefreshFallback: (error: unknown) => void;
};

type MessageReloadSchedulerInput = {
  isMounted: () => boolean;
  onLoadMessages: (reason: string) => Promise<void>;
  onLogReload: (event: string, details?: Record<string, unknown>) => void;
};

type MessageReloadLifecycleInput = {
  isMounted: () => boolean;
  scheduleMessageReload: (reason: string, delayMs?: number) => void;
  onLogReload: (event: string, details?: Record<string, unknown>) => void;
  maintenanceBatchLimit?: number;
  maintenanceIntervalMs?: number;
};

type MessageBundleControllerInput = {
  isMounted: () => boolean;
  onMessagesCommitted?: (reason: string, messageList: Message[]) => void;
};

type UseMessagesInput = {
  currentServerId: string | null;
  currentChannelId: string | null;
  currentUserId: string | null;
  blockedUserIds: ReadonlySet<string>;
  isCurrentUserElevatedInServer: boolean;
  ensureIsElevatedInServer: (communityId: string) => Promise<boolean>;
  debugChannelReloads: boolean;
  channels: Channel[];
  // Retained for compatibility with the current orchestration call site.
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageReactions: React.Dispatch<React.SetStateAction<MessageReaction[]>>;
  setMessageAttachments: React.Dispatch<
    React.SetStateAction<MessageAttachment[]>
  >;
  setMessageLinkPreviews: React.Dispatch<
    React.SetStateAction<MessageLinkPreview[]>
  >;
  setAuthorProfiles: React.Dispatch<
    React.SetStateAction<Record<string, AuthorProfile>>
  >;
  authorProfileCacheRef: React.MutableRefObject<Record<string, AuthorProfile>>;
};

export function useMessages({
  currentServerId,
  currentChannelId,
  currentUserId,
  blockedUserIds,
  isCurrentUserElevatedInServer,
  ensureIsElevatedInServer,
  debugChannelReloads,
  channels,
  authorProfileCacheRef,
}: UseMessagesInput) {
  const requestOlderMessagesRef = React.useRef<(() => Promise<void>) | null>(
    null,
  );
  const messageBundleByChannelCacheRef = React.useRef<
    Record<string, ChannelMessageBundleCacheEntry>
  >({});
  const latestLoadIdRef = React.useRef(0);
  const olderLoadInFlightRef = React.useRef(false);
  const currentHasOlderMessagesRef = React.useRef(false);
  const oldestLoadedCursorRef = React.useRef<{
    createdAt: string;
    id: string;
  } | null>(null);
  const currentMessageListRef = React.useRef<Message[]>([]);
  const currentReactionListRef = React.useRef<MessageReaction[]>([]);
  const currentAttachmentListRef = React.useRef<MessageAttachment[]>([]);
  const currentLinkPreviewListRef = React.useRef<MessageLinkPreview[]>([]);
  const revokedUserIdsByChannelRef = React.useRef<Record<string, string[]>>({});
  const loadedRevokedUserIdsByChannelRef = React.useRef<
    Record<string, boolean>
  >({});
  const cleanupIntervalRef = useRef<number | null>(null);
  const lastFreshMessageLoadAtRef = React.useRef(0);

  const setStoredMessages = React.useCallback((messages: Message[]) => {
    useMessagesStore.getState().setMessages(messages);
  }, []);

  const setStoredReactions = React.useCallback(
    (reactions: MessageReaction[]) => {
      useMessagesStore.getState().setReactions(reactions);
    },
    [],
  );

  const setStoredAttachments = React.useCallback(
    (attachments: MessageAttachment[]) => {
      useMessagesStore.getState().setAttachments(attachments);
    },
    [],
  );

  const setStoredLinkPreviews = React.useCallback(
    (linkPreviews: MessageLinkPreview[]) => {
      useMessagesStore.getState().setLinkPreviews(linkPreviews);
    },
    [],
  );

  const setStoredProfiles = React.useCallback(
    (profiles: Record<string, AuthorProfile>) => {
      useMessagesStore.getState().setProfiles(profiles);
    },
    [],
  );

  const setStoredIsLoading = React.useCallback((isLoading: boolean) => {
    useMessagesStore.getState().setIsLoading(isLoading);
  }, []);

  const setStoredHasMore = React.useCallback((hasMore: boolean) => {
    useMessagesStore.getState().setHasMore(hasMore);
  }, []);

  const resetStoredMessages = React.useCallback(() => {
    useMessagesStore.getState().reset();
  }, []);

  const markMessagesFresh = React.useCallback(() => {
    lastFreshMessageLoadAtRef.current = Date.now();
  }, []);

  const areMessagesFresh = React.useCallback(
    () =>
      Date.now() - lastFreshMessageLoadAtRef.current <
      MESSAGE_RELOAD_FRESHNESS_WINDOW_MS,
    [],
  );

  const getChannelBundleCacheKey = React.useCallback(
    (communityId: string, channelId: string) => `${communityId}:${channelId}`,
    [],
  );

  const getChannelRevocationCacheKey = getChannelBundleCacheKey;

  const getCachedChannelBundle = React.useCallback(
    (
      communityId: string,
      channelId: string,
    ): ChannelMessageBundleCacheEntry | null => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      return messageBundleByChannelCacheRef.current[cacheKey] ?? null;
    },
    [getChannelBundleCacheKey],
  );

  const cacheChannelBundle = React.useCallback(
    (
      communityId: string,
      channelId: string,
      bundle: ChannelMessageBundleCacheEntry,
    ) => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      messageBundleByChannelCacheRef.current[cacheKey] = bundle;
    },
    [getChannelBundleCacheKey],
  );

  const getCachedChannelRevokedUserIds = React.useCallback(
    (communityId: string, channelId: string): string[] | null => {
      if (!communityId || !channelId) return null;
      const cacheKey = getChannelRevocationCacheKey(communityId, channelId);
      return Object.prototype.hasOwnProperty.call(
        revokedUserIdsByChannelRef.current,
        cacheKey,
      )
        ? (revokedUserIdsByChannelRef.current[cacheKey] ?? [])
        : null;
    },
    [getChannelRevocationCacheKey],
  );

  const cacheChannelRevokedUserIds = React.useCallback(
    (
      communityId: string,
      channelId: string,
      revokedUserIds: string[],
      options?: { loaded?: boolean },
    ) => {
      if (!communityId || !channelId) return [] as string[];
      const cacheKey = getChannelRevocationCacheKey(communityId, channelId);
      const nextRevokedUserIds = Array.from(
        new Set(revokedUserIds.filter(Boolean)),
      );
      revokedUserIdsByChannelRef.current[cacheKey] = nextRevokedUserIds;
      if (options?.loaded === true) {
        loadedRevokedUserIdsByChannelRef.current[cacheKey] = true;
      }
      return nextRevokedUserIds;
    },
    [getChannelRevocationCacheKey],
  );

  const ensureChannelRevokedUserIdsLoaded = React.useCallback(
    async (communityId: string, channelId: string) => {
      if (!communityId || !channelId) return [] as string[];
      const cacheKey = getChannelRevocationCacheKey(communityId, channelId);
      const cachedRevokedUserIds = getCachedChannelRevokedUserIds(
        communityId,
        channelId,
      );
      if (
        cachedRevokedUserIds &&
        loadedRevokedUserIdsByChannelRef.current[cacheKey] === true
      ) {
        return cachedRevokedUserIds;
      }

      const communityBackend = getCommunityDataBackend(communityId);
      const revokedUserIds = await communityBackend.listChannelRevokedUserIds({
        communityId,
        channelId,
      });
      return cacheChannelRevokedUserIds(
        communityId,
        channelId,
        revokedUserIds,
        { loaded: true },
      );
    },
    [
      cacheChannelRevokedUserIds,
      getCachedChannelRevokedUserIds,
      getChannelRevocationCacheKey,
    ],
  );

  const addChannelRevokedUserIdToCache = React.useCallback(
    (communityId: string, channelId: string, revokedUserId: string) => {
      if (!communityId || !channelId || !revokedUserId) return [] as string[];
      const existingRevokedUserIds =
        getCachedChannelRevokedUserIds(communityId, channelId) ?? [];
      if (existingRevokedUserIds.includes(revokedUserId)) {
        return existingRevokedUserIds;
      }
      return cacheChannelRevokedUserIds(communityId, channelId, [
        ...existingRevokedUserIds,
        revokedUserId,
      ]);
    },
    [cacheChannelRevokedUserIds, getCachedChannelRevokedUserIds],
  );

  const applyChannelAccessVisibility = React.useCallback(
    (input: {
      communityId: string;
      channelId: string;
      messages: Message[];
      reactions: MessageReaction[];
      attachments: MessageAttachment[];
      linkPreviews: MessageLinkPreview[];
      revokedUserIds?: string[];
    }) =>
      applyChannelAccessVisibilityToMessageBundle(
        {
          messages: input.messages,
          reactions: input.reactions,
          attachments: input.attachments,
          linkPreviews: input.linkPreviews,
        },
        {
          channelId: input.channelId,
          revokedUserIds:
            input.revokedUserIds ??
            getCachedChannelRevokedUserIds(
              input.communityId,
              input.channelId,
            ) ??
            [],
        },
      ),
    [getCachedChannelRevokedUserIds],
  );

  const applyBlockVisibility = React.useCallback(
    (input: {
      messages: Message[];
      reactions: MessageReaction[];
      attachments: MessageAttachment[];
      linkPreviews: MessageLinkPreview[];
      blockedUserIds?: ReadonlySet<string>;
      isElevatedInServer?: boolean;
    }) =>
      filterBlockedUserContent(
        {
          messages: input.messages,
          reactions: input.reactions,
          attachments: input.attachments,
          linkPreviews: input.linkPreviews,
        },
        input.blockedUserIds ?? blockedUserIds,
        input.isElevatedInServer ?? isCurrentUserElevatedInServer,
      ),
    [blockedUserIds, isCurrentUserElevatedInServer],
  );

  const applyCurrentChannelVisibility = React.useCallback(
    (bundle: {
      messages: Message[];
      reactions: MessageReaction[];
      attachments: MessageAttachment[];
      linkPreviews: MessageLinkPreview[];
    }) => {
      if (!currentServerId || !currentChannelId) return bundle;
      const moderationFilteredBundle = applyChannelAccessVisibility({
        communityId: currentServerId,
        channelId: currentChannelId,
        ...bundle,
      });
      return applyBlockVisibility(moderationFilteredBundle);
    },
    [
      applyBlockVisibility,
      applyChannelAccessVisibility,
      currentChannelId,
      currentServerId,
    ],
  );

  const purgeMessageBundleCacheForServer = React.useCallback(
    (communityId: string) => {
      if (!communityId) return;

      for (const cacheKey of Object.keys(
        messageBundleByChannelCacheRef.current,
      )) {
        if (!cacheKey.startsWith(`${communityId}:`)) continue;
        delete messageBundleByChannelCacheRef.current[cacheKey];
      }
    },
    [],
  );

  const purgeMessageBundleCacheForChannel = React.useCallback(
    (communityId: string, channelId: string) => {
      if (!communityId || !channelId) return;
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      delete messageBundleByChannelCacheRef.current[cacheKey];
    },
    [getChannelBundleCacheKey],
  );

  const prefetchChannelMessages = React.useCallback(
    async (serverId: string, channelId: string) => {
      const cacheKey = getChannelBundleCacheKey(serverId, channelId);
      if (messageBundleByChannelCacheRef.current[cacheKey]) return;
      try {
        const communityBackend = getCommunityDataBackend(serverId);
        const page = await communityBackend.listMessagesPage({
          communityId: serverId,
          channelId,
          beforeCursor: null,
          limit: MESSAGE_PAGE_SIZE,
        });
        const messages = page.messages;
        const messageIds = messages.map((m) => m.id);
        const [reactions, attachments, linkPreviews] =
          messageIds.length > 0
            ? await Promise.all([
                communityBackend.listMessageReactionsForMessages({
                  communityId: serverId,
                  channelId,
                  messageIds,
                }),
                communityBackend.listMessageAttachmentsForMessages({
                  communityId: serverId,
                  channelId,
                  messageIds,
                }),
                communityBackend.listMessageLinkPreviewsForMessages({
                  communityId: serverId,
                  channelId,
                  messageIds,
                }),
              ])
            : [
                [] as MessageReaction[],
                [] as MessageAttachment[],
                [] as MessageLinkPreview[],
              ];
        const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
          serverId,
          channelId,
        );
        const moderationFilteredBundle = applyChannelAccessVisibility({
          communityId: serverId,
          channelId,
          messages,
          reactions,
          attachments,
          linkPreviews,
          revokedUserIds,
        });
        const filteredBundle = applyBlockVisibility({
          ...moderationFilteredBundle,
          isElevatedInServer: await ensureIsElevatedInServer(serverId),
        });
        // Only write if not already populated — avoid clobbering an active channel load
        if (!messageBundleByChannelCacheRef.current[cacheKey]) {
          messageBundleByChannelCacheRef.current[cacheKey] = {
            messages: filteredBundle.messages,
            reactions: filteredBundle.reactions,
            attachments: filteredBundle.attachments,
            linkPreviews: filteredBundle.linkPreviews,
            hasOlderMessages: page.hasMore,
          };
        }
      } catch {
        // silent — prefetch failures are non-fatal
      }
    },
    [
      applyBlockVisibility,
      applyChannelAccessVisibility,
      ensureIsElevatedInServer,
      ensureChannelRevokedUserIdsLoaded,
      getChannelBundleCacheKey,
    ],
  );

  const setRequestOlderMessagesLoader = React.useCallback(
    (loader: (() => Promise<void>) | null) => {
      requestOlderMessagesRef.current = loader;
    },
    [],
  );

  const clearRequestOlderMessagesLoader = React.useCallback(() => {
    requestOlderMessagesRef.current = null;
  }, []);

  const requestOlderMessages = React.useCallback(async () => {
    const loader = requestOlderMessagesRef.current;
    if (!loader) return;
    await loader();
  }, []);

  const createNextMessageLoadId = React.useCallback(() => {
    latestLoadIdRef.current += 1;
    return latestLoadIdRef.current;
  }, []);

  const isCurrentMessageLoad = React.useCallback(
    (loadId: number) => latestLoadIdRef.current === loadId,
    [],
  );

  const syncOldestLoadedCursor = React.useCallback((messageList: Message[]) => {
    oldestLoadedCursorRef.current =
      messageList.length > 0
        ? { createdAt: messageList[0].created_at, id: messageList[0].id }
        : null;
  }, []);

  const syncLoadedMessageWindow = React.useCallback(
    (messageList: Message[], hasOlder: boolean) => {
      currentHasOlderMessagesRef.current = hasOlder;
      oldestLoadedCursorRef.current =
        messageList.length > 0
          ? { createdAt: messageList[0].created_at, id: messageList[0].id }
          : null;
      setStoredHasMore(hasOlder);
    },
    [setStoredHasMore],
  );

  const tryBeginOlderMessagesLoad = React.useCallback(() => {
    if (olderLoadInFlightRef.current) return null;
    if (!currentHasOlderMessagesRef.current || !oldestLoadedCursorRef.current)
      return null;

    olderLoadInFlightRef.current = true;
    setStoredIsLoading(true);
    latestLoadIdRef.current += 1;

    return {
      loadId: latestLoadIdRef.current,
      oldestLoadedCursor: oldestLoadedCursorRef.current,
    };
  }, []);

  const finishOlderMessagesLoad = React.useCallback(
    (options?: { updateUi?: boolean }) => {
      olderLoadInFlightRef.current = false;
      if (options?.updateUi === false) return;
      setStoredIsLoading(false);
    },
    [setStoredIsLoading],
  );

  const resetMessageState = React.useCallback(() => {
    resetStoredMessages();
    latestLoadIdRef.current = 0;
    olderLoadInFlightRef.current = false;
    currentHasOlderMessagesRef.current = false;
    oldestLoadedCursorRef.current = null;
    currentMessageListRef.current = [];
    currentReactionListRef.current = [];
    currentAttachmentListRef.current = [];
    currentLinkPreviewListRef.current = [];
    lastFreshMessageLoadAtRef.current = 0;
    requestOlderMessagesRef.current = null;
  }, [resetStoredMessages]);
  const { setRainbowMode } = useUserStatusStore();
  const sendMessage = React.useCallback(
    async (
      content: string,
      options?: {
        replyToMessageId?: string;
        mediaFile?: File;
        mediaExpiresInHours?: number;
      },
    ) => {
      if (content === "#RainbowRoad") {
        setRainbowMode(!useUserStatusStore.getState().rainbowMode);
        return;
      }
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
    [currentChannelId, currentServerId, currentUserId, setRainbowMode],
  );

  const toggleMessageReaction = React.useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentServerId || !currentChannelId)
        throw new Error("No channel selected.");

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.toggleMessageReaction({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageId,
        emoji,
      });
    },
    [currentChannelId, currentServerId],
  );

  const editMessage = React.useCallback(
    async (messageId: string, content: string) => {
      if (!currentServerId) throw new Error("No server selected.");
      const trimmedContent = content.trim();
      if (!trimmedContent) throw new Error("Message content is required.");

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.editUserMessage({
        communityId: currentServerId,
        messageId,
        content: trimmedContent,
      });
    },
    [currentServerId],
  );

  const deleteMessage = React.useCallback(
    async (messageId: string) => {
      if (!currentServerId) throw new Error("No server selected.");

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.deleteMessage({
        communityId: currentServerId,
        messageId,
      });
      const { messages, reactions, attachments, linkPreviews } =
        useMessagesStore.getState();
      const nextMessages = messages.filter(
        (message) => message.id !== messageId,
      );
      const nextReactions = Object.values(reactions).filter(
        (reaction) => reaction.messageId !== messageId,
      );
      const nextAttachments = Object.values(attachments).filter(
        (attachment) => attachment.messageId !== messageId,
      );
      const nextLinkPreviews = Object.values(linkPreviews).filter(
        (preview) => preview.messageId !== messageId,
      );

      currentMessageListRef.current = nextMessages;
      currentReactionListRef.current = nextReactions;
      currentAttachmentListRef.current = nextAttachments;
      currentLinkPreviewListRef.current = nextLinkPreviews;
      syncOldestLoadedCursor(nextMessages);

      if (currentChannelId) {
        cacheChannelBundle(currentServerId, currentChannelId, {
          messages: nextMessages,
          reactions: nextReactions,
          attachments: nextAttachments,
          linkPreviews: nextLinkPreviews,
          hasOlderMessages: currentHasOlderMessagesRef.current,
        });
      }

      setStoredMessages(nextMessages);
      setStoredReactions(nextReactions);
      setStoredAttachments(nextAttachments);
      setStoredLinkPreviews(nextLinkPreviews);
      markMessagesFresh();
    },
    [
      cacheChannelBundle,
      currentChannelId,
      currentServerId,
      markMessagesFresh,
      setStoredAttachments,
      setStoredLinkPreviews,
      setStoredMessages,
      setStoredReactions,
      syncOldestLoadedCursor,
    ],
  );

  const reportMessage = React.useCallback(
    async (input: {
      messageId: string;
      target: MessageReportTarget;
      kind: MessageReportKind;
      comment: string;
    }) => {
      if (!currentUserId || !currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
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
    [currentChannelId, currentServerId, currentUserId],
  );

  const requestMessageLinkPreviewRefresh = React.useCallback(
    async (messageId: string) => {
      if (!currentServerId || !currentChannelId)
        throw new Error("No channel selected.");

      const selectedChannel = channels.find(
        (channel) => channel.id === currentChannelId,
      );
      if (!selectedChannel || selectedChannel.kind !== "text") {
        throw new Error(
          "Link previews can only be refreshed in text channels.",
        );
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.requestChannelLinkPreviewBackfill({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: [messageId],
      });
    },
    [channels, currentChannelId, currentServerId],
  );

  const fetchLatestMessageWindow = React.useCallback(
    async (targetCount: number) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      const boundedTargetCount = Math.max(
        Math.floor(targetCount),
        MESSAGE_PAGE_SIZE,
      );
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
        beforeCursor = nextOldest
          ? { createdAt: nextOldest.created_at, id: nextOldest.id }
          : null;
        if (!beforeCursor) break;
      }

      return { messageList: aggregatedMessages, hasMore };
    },
    [currentChannelId, currentServerId],
  );

  const fetchMessagesPageBeforeCursor = React.useCallback(
    async (
      beforeCursor: { createdAt: string; id: string },
      limit = MESSAGE_PAGE_SIZE,
    ) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.listMessagesPage({
        communityId: currentServerId,
        channelId: currentChannelId,
        beforeCursor,
        limit: Math.max(1, Math.floor(limit)),
      });
    },
    [currentChannelId, currentServerId],
  );

  const fetchRelatedForMessages = React.useCallback(
    async (messageList: Message[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
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
      const [reactionList, attachmentList, linkPreviewList] = await Promise.all(
        [
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
        ],
      );

      return { reactionList, attachmentList, linkPreviewList };
    },
    [currentChannelId, currentServerId],
  );

  const fetchMessageAttachmentsForMessageIds = React.useCallback(
    async (messageIds: string[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
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
    [currentChannelId, currentServerId],
  );

  const fetchMessageLinkPreviewsForMessageIds = React.useCallback(
    async (messageIds: string[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
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
    [currentChannelId, currentServerId],
  );

  const runMessageMediaMaintenance = React.useCallback(
    async (limit = 100) => {
      if (!currentServerId) {
        throw new Error("No server selected.");
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.runMessageMediaMaintenance(limit);
    },
    [currentServerId],
  );

  const loadLatestMessagesWithRelated = React.useCallback(
    async (currentMessageCount: number) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No server selected.");
      }

      const loadId = createNextMessageLoadId();
      const startedAt = Date.now();
      const targetCount = Math.max(currentMessageCount, MESSAGE_PAGE_SIZE);
      const { messageList, hasMore } =
        await fetchLatestMessageWindow(targetCount);
      const { reactionList, attachmentList, linkPreviewList } =
        await fetchRelatedForMessages(messageList);
      const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
        currentServerId,
        currentChannelId,
      );
      const moderationFilteredBundle = applyChannelAccessVisibility({
        communityId: currentServerId,
        channelId: currentChannelId,
        messages: messageList,
        reactions: reactionList,
        attachments: attachmentList,
        linkPreviews: linkPreviewList,
        revokedUserIds,
      });
      const filteredBundle = applyBlockVisibility({
        ...moderationFilteredBundle,
        isElevatedInServer: await ensureIsElevatedInServer(currentServerId),
      });

      return {
        loadId,
        startedAt,
        messageList: filteredBundle.messages,
        reactionList: filteredBundle.reactions,
        attachmentList: filteredBundle.attachments,
        linkPreviewList: filteredBundle.linkPreviews,
        hasOlder: hasMore,
      };
    },
    [
      applyBlockVisibility,
      createNextMessageLoadId,
      applyChannelAccessVisibility,
      currentChannelId,
      currentServerId,
      ensureIsElevatedInServer,
      ensureChannelRevokedUserIdsLoaded,
      fetchLatestMessageWindow,
      fetchRelatedForMessages,
    ],
  );

  const loadOlderMessagesWithRelated = React.useCallback(
    async (currentMessageList: Message[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No server selected.");
      }

      const olderLoad = tryBeginOlderMessagesLoad();
      if (!olderLoad) {
        return { kind: "skipped" as const };
      }

      const { loadId, oldestLoadedCursor } = olderLoad;
      const startedAt = Date.now();

      const page = await fetchMessagesPageBeforeCursor(
        oldestLoadedCursor,
        MESSAGE_PAGE_SIZE,
      );

      if (page.messages.length === 0) {
        return {
          kind: "no_more" as const,
          loadId,
          startedAt,
          oldestLoadedCursor,
        };
      }

      const existingIds = new Set(
        currentMessageList.map((message) => message.id),
      );
      const prependMessages = page.messages.filter(
        (message) => !existingIds.has(message.id),
      );
      const nextMessageList = [...prependMessages, ...currentMessageList];
      const { reactionList, attachmentList, linkPreviewList } =
        await fetchRelatedForMessages(nextMessageList);
      const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
        currentServerId,
        currentChannelId,
      );
      const moderationFilteredBundle = applyChannelAccessVisibility({
        communityId: currentServerId,
        channelId: currentChannelId,
        messages: nextMessageList,
        reactions: reactionList,
        attachments: attachmentList,
        linkPreviews: linkPreviewList,
        revokedUserIds,
      });
      const filteredBundle = applyBlockVisibility({
        ...moderationFilteredBundle,
        isElevatedInServer: await ensureIsElevatedInServer(currentServerId),
      });

      return {
        kind: "loaded" as const,
        loadId,
        startedAt,
        oldestLoadedCursor,
        prependCount: prependMessages.length,
        messageList: filteredBundle.messages,
        reactionList: filteredBundle.reactions,
        attachmentList: filteredBundle.attachments,
        linkPreviewList: filteredBundle.linkPreviews,
        hasOlder: page.hasMore,
      };
    },
    [
      applyBlockVisibility,
      applyChannelAccessVisibility,
      currentChannelId,
      currentServerId,
      ensureIsElevatedInServer,
      ensureChannelRevokedUserIdsLoaded,
      fetchMessagesPageBeforeCursor,
      fetchRelatedForMessages,
      tryBeginOlderMessagesLoad,
    ],
  );

  const getAffectedMessageIdFromRealtimePayload = React.useCallback(
    (
      payload: unknown,
      currentRows: { id: string; messageId: string }[],
    ): string | null => {
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const directMessageId =
        getStringField(nextRow, "message_id") ??
        getStringField(oldRow, "message_id");
      if (directMessageId) return directMessageId;

      const rowId =
        getStringField(nextRow, "id") ?? getStringField(oldRow, "id");
      if (!rowId) return null;
      return currentRows.find((row) => row.id === rowId)?.messageId ?? null;
    },
    [],
  );

  const applyIncrementalMessageRealtimePayload = React.useCallback(
    ({
      payload,
      currentMessageList,
      currentReactionList,
      currentAttachmentList,
      currentLinkPreviewList,
      commitMessages,
      commitReactions,
      commitAttachments,
      commitLinkPreviews,
    }: IncrementalMessageApplyInput): boolean => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) return false;

      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const rowRecord = eventType === "DELETE" ? oldRow : nextRow;
      const messageId = getStringField(rowRecord, "id");
      if (!messageId) return false;

      if (eventType === "DELETE") {
        if (!currentMessageList.some((message) => message.id === messageId))
          return true;
        commitMessages(
          currentMessageList.filter((message) => message.id !== messageId),
          "messages_sub_delete",
        );
        commitReactions(
          currentReactionList.filter(
            (reaction) => reaction.messageId !== messageId,
          ),
        );
        commitAttachments(
          currentAttachmentList.filter(
            (attachment) => attachment.messageId !== messageId,
          ),
        );
        commitLinkPreviews(
          currentLinkPreviewList.filter(
            (preview) => preview.messageId !== messageId,
          ),
        );
        return true;
      }

      const deletedAt = getNullableStringField(nextRow, "deleted_at");
      if (deletedAt) {
        if (!currentMessageList.some((message) => message.id === messageId))
          return true;
        commitMessages(
          currentMessageList.filter((message) => message.id !== messageId),
          "messages_sub_soft_delete",
        );
        commitReactions(
          currentReactionList.filter(
            (reaction) => reaction.messageId !== messageId,
          ),
        );
        commitAttachments(
          currentAttachmentList.filter(
            (attachment) => attachment.messageId !== messageId,
          ),
        );
        commitLinkPreviews(
          currentLinkPreviewList.filter(
            (preview) => preview.messageId !== messageId,
          ),
        );
        return true;
      }

      if (!nextRow) return false;
      const messageRow = nextRow as unknown as Message;
      const existingIndex = currentMessageList.findIndex(
        (message) => message.id === messageId,
      );
      const nextMessages = [...currentMessageList];
      if (existingIndex >= 0) {
        nextMessages[existingIndex] = messageRow;
      } else {
        nextMessages.push(messageRow);
      }
      nextMessages.sort(compareMessagesAsc);
      const moderatedBundle = applyCurrentChannelVisibility({
        messages: nextMessages,
        reactions: currentReactionList,
        attachments: currentAttachmentList,
        linkPreviews: currentLinkPreviewList,
      });
      commitMessages(
        moderatedBundle.messages,
        existingIndex >= 0 ? "messages_sub_update" : "messages_sub_insert",
      );
      commitReactions(moderatedBundle.reactions);
      commitAttachments(moderatedBundle.attachments);
      commitLinkPreviews(moderatedBundle.linkPreviews);
      return true;
    },
    [applyCurrentChannelVisibility],
  );

  const applyIncrementalReactionRealtimePayload = React.useCallback(
    ({
      payload,
      currentMessageList,
      currentReactionList,
      commitReactions,
    }: IncrementalReactionApplyInput) => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) return false;
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);

      if (eventType === "DELETE") {
        const reactionId = getStringField(oldRow, "id");
        if (!reactionId) return false;
        if (!currentReactionList.some((reaction) => reaction.id === reactionId))
          return true;
        commitReactions(
          currentReactionList.filter((reaction) => reaction.id !== reactionId),
        );
        return true;
      }

      const reactionRow = parseReactionFromRow(nextRow);
      if (!reactionRow) return false;
      if (
        !currentMessageList.some(
          (message) => message.id === reactionRow.messageId,
        )
      )
        return true;

      const existingIndex = currentReactionList.findIndex(
        (reaction) => reaction.id === reactionRow.id,
      );
      const nextReactions = [...currentReactionList];
      if (existingIndex >= 0) {
        nextReactions[existingIndex] = reactionRow;
      } else {
        nextReactions.push(reactionRow);
      }
      nextReactions.sort((left, right) => {
        if (left.createdAt < right.createdAt) return -1;
        if (left.createdAt > right.createdAt) return 1;
        if (left.id < right.id) return -1;
        if (left.id > right.id) return 1;
        return 0;
      });
      const moderatedBundle = applyCurrentChannelVisibility({
        messages: currentMessageList,
        reactions: nextReactions,
        attachments: [] as MessageAttachment[],
        linkPreviews: [] as MessageLinkPreview[],
      });
      commitReactions(moderatedBundle.reactions);
      return true;
    },
    [applyCurrentChannelVisibility],
  );

  const subscribeToMessageRealtimeStreams = React.useCallback(
    (input: SubscribeToMessageRealtimeStreamsInput) => {
      if (!currentServerId || !currentChannelId) {
        return () => {};
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      const messageChannel = communityBackend.subscribeToMessages(
        currentChannelId,
        input.onMessagePayload,
      );
      const reactionsChannel = communityBackend.subscribeToMessageReactions(
        currentChannelId,
        input.onReactionPayload,
      );
      const attachmentsChannel = communityBackend.subscribeToMessageAttachments(
        currentChannelId,
        input.onAttachmentPayload,
      );
      const linkPreviewsChannel =
        communityBackend.subscribeToMessageLinkPreviews(
          currentChannelId,
          input.onLinkPreviewPayload,
        );

      return () => {
        void messageChannel.unsubscribe();
        void reactionsChannel.unsubscribe();
        void attachmentsChannel.unsubscribe();
        void linkPreviewsChannel.unsubscribe();
      };
    },
    [currentChannelId, currentServerId],
  );

  const createIncrementalRelatedRefreshQueues = React.useCallback(
    (input: IncrementalRelatedRefreshQueuesInput) => {
      let pendingAttachmentRefreshTimerId: number | null = null;
      let pendingLinkPreviewRefreshTimerId: number | null = null;
      let attachmentRefreshInFlight = false;
      let linkPreviewRefreshInFlight = false;
      const pendingAttachmentRefreshMessageIds = new Set<string>();
      const pendingLinkPreviewRefreshMessageIds = new Set<string>();

      const flushAttachmentRefreshQueue = () => {
        if (!input.isMounted()) return;
        if (attachmentRefreshInFlight) return;
        if (pendingAttachmentRefreshMessageIds.size === 0) return;

        const messageIds = Array.from(pendingAttachmentRefreshMessageIds);
        pendingAttachmentRefreshMessageIds.clear();
        attachmentRefreshInFlight = true;

        void (async () => {
          const currentMessageList = input.getCurrentMessageList();
          const currentAttachmentList = input.getCurrentAttachmentList();
          const uniqueMessageIds = Array.from(
            new Set(
              messageIds.filter((messageId) =>
                currentMessageList.some((message) => message.id === messageId),
              ),
            ),
          );
          if (uniqueMessageIds.length === 0) return;

          const refreshedRows =
            await fetchMessageAttachmentsForMessageIds(uniqueMessageIds);
          const nextAttachments = [
            ...currentAttachmentList.filter(
              (attachment) => !uniqueMessageIds.includes(attachment.messageId),
            ),
            ...refreshedRows,
          ].sort((left, right) => {
            if (left.createdAt < right.createdAt) return -1;
            if (left.createdAt > right.createdAt) return 1;
            if (left.id < right.id) return -1;
            if (left.id > right.id) return 1;
            return 0;
          });

          const moderatedBundle = applyCurrentChannelVisibility({
            messages: currentMessageList,
            reactions: [] as MessageReaction[],
            attachments: nextAttachments,
            linkPreviews: input.getCurrentLinkPreviewList(),
          });

          input.commitAttachments(moderatedBundle.attachments);
        })()
          .catch((error) => {
            input.onAttachmentRefreshFallback(error);
          })
          .finally(() => {
            attachmentRefreshInFlight = false;
            if (!input.isMounted()) return;
            if (
              pendingAttachmentRefreshMessageIds.size > 0 &&
              pendingAttachmentRefreshTimerId === null
            ) {
              pendingAttachmentRefreshTimerId = window.setTimeout(() => {
                pendingAttachmentRefreshTimerId = null;
                flushAttachmentRefreshQueue();
              }, 25);
            }
          });
      };

      const queueAttachmentRefresh = (messageId: string) => {
        if (!messageId) return;
        pendingAttachmentRefreshMessageIds.add(messageId);
        if (pendingAttachmentRefreshTimerId !== null) return;
        pendingAttachmentRefreshTimerId = window.setTimeout(() => {
          pendingAttachmentRefreshTimerId = null;
          flushAttachmentRefreshQueue();
        }, 25);
      };

      const flushLinkPreviewRefreshQueue = () => {
        if (!input.isMounted()) return;
        if (linkPreviewRefreshInFlight) return;
        if (pendingLinkPreviewRefreshMessageIds.size === 0) return;

        const messageIds = Array.from(pendingLinkPreviewRefreshMessageIds);
        pendingLinkPreviewRefreshMessageIds.clear();
        linkPreviewRefreshInFlight = true;

        void (async () => {
          const currentMessageList = input.getCurrentMessageList();
          const currentLinkPreviewList = input.getCurrentLinkPreviewList();
          const uniqueMessageIds = Array.from(
            new Set(
              messageIds.filter((messageId) =>
                currentMessageList.some((message) => message.id === messageId),
              ),
            ),
          );
          if (uniqueMessageIds.length === 0) return;

          const refreshedRows =
            await fetchMessageLinkPreviewsForMessageIds(uniqueMessageIds);
          const nextLinkPreviews = [
            ...currentLinkPreviewList.filter(
              (preview) => !uniqueMessageIds.includes(preview.messageId),
            ),
            ...refreshedRows,
          ].sort((left, right) => {
            if (left.createdAt < right.createdAt) return -1;
            if (left.createdAt > right.createdAt) return 1;
            if (left.id < right.id) return -1;
            if (left.id > right.id) return 1;
            return 0;
          });

          const moderatedBundle = applyCurrentChannelVisibility({
            messages: currentMessageList,
            reactions: [] as MessageReaction[],
            attachments: input.getCurrentAttachmentList(),
            linkPreviews: nextLinkPreviews,
          });

          input.commitLinkPreviews(moderatedBundle.linkPreviews);
        })()
          .catch((error) => {
            input.onLinkPreviewRefreshFallback(error);
          })
          .finally(() => {
            linkPreviewRefreshInFlight = false;
            if (!input.isMounted()) return;
            if (
              pendingLinkPreviewRefreshMessageIds.size > 0 &&
              pendingLinkPreviewRefreshTimerId === null
            ) {
              pendingLinkPreviewRefreshTimerId = window.setTimeout(() => {
                pendingLinkPreviewRefreshTimerId = null;
                flushLinkPreviewRefreshQueue();
              }, 25);
            }
          });
      };

      const queueLinkPreviewRefresh = (messageId: string) => {
        if (!messageId) return;
        pendingLinkPreviewRefreshMessageIds.add(messageId);
        if (pendingLinkPreviewRefreshTimerId !== null) return;
        pendingLinkPreviewRefreshTimerId = window.setTimeout(() => {
          pendingLinkPreviewRefreshTimerId = null;
          flushLinkPreviewRefreshQueue();
        }, 25);
      };

      const cleanup = () => {
        if (pendingAttachmentRefreshTimerId !== null) {
          window.clearTimeout(pendingAttachmentRefreshTimerId);
        }
        if (pendingLinkPreviewRefreshTimerId !== null) {
          window.clearTimeout(pendingLinkPreviewRefreshTimerId);
        }
        pendingAttachmentRefreshTimerId = null;
        pendingLinkPreviewRefreshTimerId = null;
        pendingAttachmentRefreshMessageIds.clear();
        pendingLinkPreviewRefreshMessageIds.clear();
        attachmentRefreshInFlight = false;
        linkPreviewRefreshInFlight = false;
      };

      return {
        queueAttachmentRefresh,
        queueLinkPreviewRefresh,
        cleanup,
      };
    },
    [
      applyCurrentChannelVisibility,
      fetchMessageAttachmentsForMessageIds,
      fetchMessageLinkPreviewsForMessageIds,
    ],
  );

  const applyChannelAccessRevokedContentVisibility = React.useCallback(
    (input: {
      communityId: string;
      channelId: string;
      revokedUserId: string;
    }) => {
      if (!input.communityId || !input.channelId || !input.revokedUserId)
        return;

      const revokedUserIds = addChannelRevokedUserIdToCache(
        input.communityId,
        input.channelId,
        input.revokedUserId,
      );
      const cacheKey = getChannelBundleCacheKey(
        input.communityId,
        input.channelId,
      );
      const cachedBundle = messageBundleByChannelCacheRef.current[cacheKey];
      if (cachedBundle) {
        const moderationFilteredBundle = applyChannelAccessVisibility({
          communityId: input.communityId,
          channelId: input.channelId,
          messages: cachedBundle.messages,
          reactions: cachedBundle.reactions,
          attachments: cachedBundle.attachments,
          linkPreviews: cachedBundle.linkPreviews,
          revokedUserIds,
        });
        const filteredBundle = applyBlockVisibility(moderationFilteredBundle);
        messageBundleByChannelCacheRef.current[cacheKey] = {
          ...cachedBundle,
          messages: filteredBundle.messages,
          reactions: filteredBundle.reactions,
          attachments: filteredBundle.attachments,
          linkPreviews: filteredBundle.linkPreviews,
        };
      }

      if (
        currentServerId !== input.communityId ||
        currentChannelId !== input.channelId
      )
        return;

      const moderationFilteredBundle = applyChannelAccessVisibility({
        communityId: input.communityId,
        channelId: input.channelId,
        messages: currentMessageListRef.current,
        reactions: currentReactionListRef.current,
        attachments: currentAttachmentListRef.current,
        linkPreviews: currentLinkPreviewListRef.current,
        revokedUserIds,
      });
      const filteredBundle = applyBlockVisibility(moderationFilteredBundle);

      currentMessageListRef.current = filteredBundle.messages;
      currentReactionListRef.current = filteredBundle.reactions;
      currentAttachmentListRef.current = filteredBundle.attachments;
      currentLinkPreviewListRef.current = filteredBundle.linkPreviews;
      syncLoadedMessageWindow(
        filteredBundle.messages,
        currentHasOlderMessagesRef.current,
      );
      const remainingAuthorIds = new Set(
        filteredBundle.messages
          .map((message) => message.author_user_id)
          .filter((authorUserId): authorUserId is string =>
            Boolean(authorUserId),
          ),
      );
      const nextProfiles = Object.fromEntries(
        Object.entries(useMessagesStore.getState().profiles).filter(
          ([authorUserId]) => remainingAuthorIds.has(authorUserId),
        ),
      );

      useMessagesStore.getState().setMessages(filteredBundle.messages);
      useMessagesStore.getState().setReactions(filteredBundle.reactions);
      useMessagesStore.getState().setAttachments(filteredBundle.attachments);
      useMessagesStore.getState().setLinkPreviews(filteredBundle.linkPreviews);
      useMessagesStore.getState().setProfiles(nextProfiles);
      markMessagesFresh(); // CHECKPOINT 2 COMPLETE
    },
    [
      addChannelRevokedUserIdToCache,
      applyBlockVisibility,
      applyChannelAccessVisibility,
      currentChannelId,
      currentServerId,
      getChannelBundleCacheKey,
      markMessagesFresh,
      syncLoadedMessageWindow,
    ],
  );

  const createMessageReloadScheduler = React.useCallback(
    (input: MessageReloadSchedulerInput) => {
      let activeLoadPromise: Promise<void> | null = null;
      let scheduledReloadTimerId: number | null = null;
      const pendingReloadReasons = new Set<string>();

      const flushScheduledMessageReload = () => {
        if (!input.isMounted()) return;
        if (activeLoadPromise) return;
        if (pendingReloadReasons.size === 0) return;

        const reasons = Array.from(pendingReloadReasons);
        pendingReloadReasons.clear();
        const reasonLabel = reasons.join("+");

        activeLoadPromise = input.onLoadMessages(reasonLabel).finally(() => {
          activeLoadPromise = null;
          if (!input.isMounted()) return;
          if (
            pendingReloadReasons.size > 0 &&
            scheduledReloadTimerId === null
          ) {
            scheduledReloadTimerId = window.setTimeout(() => {
              scheduledReloadTimerId = null;
              flushScheduledMessageReload();
            }, 40);
          }
        });
      };

      const scheduleMessageReload = (reason: string, delayMs = 60) => {
        if (!input.isMounted()) return;
        pendingReloadReasons.add(reason);
        input.onLogReload("load:queued", {
          reason,
          delayMs,
          pendingReasons: Array.from(pendingReloadReasons),
        });

        if (scheduledReloadTimerId !== null) return;
        if (delayMs <= 0 && !activeLoadPromise) {
          flushScheduledMessageReload();
          return;
        }

        scheduledReloadTimerId = window.setTimeout(
          () => {
            scheduledReloadTimerId = null;
            flushScheduledMessageReload();
          },
          Math.max(0, delayMs),
        );
      };

      const cleanup = () => {
        pendingReloadReasons.clear();
        if (scheduledReloadTimerId !== null) {
          window.clearTimeout(scheduledReloadTimerId);
        }
        scheduledReloadTimerId = null;
      };

      return {
        scheduleMessageReload,
        cleanup,
      };
    },
    [],
  );

  const createMessageReloadLifecycle = React.useCallback(
    (input: MessageReloadLifecycleInput) => {
      const maintenanceBatchLimit = input.maintenanceBatchLimit ?? 100;
      const maintenanceIntervalMs = input.maintenanceIntervalMs ?? 60 * 1000;

      const runMessageMediaMaintenanceForLifecycle = async () => {
        try {
          const result = await runMessageMediaMaintenance(
            maintenanceBatchLimit,
          );
          if (!input.isMounted()) return;
          if ((result.deletedMessages ?? 0) > 0) {
            input.onLogReload("maintenance:deleted", {
              deletedMessages: result.deletedMessages ?? 0,
              deletedObjects: result.deletedObjects ?? 0,
            });
            input.scheduleMessageReload("maintenance_reload", 20);
          }
        } catch (error) {
          if (!input.isMounted()) return;
          console.warn("Failed to run media maintenance:", error);
        }
      };

      const handleVisibilityChange = () => {
        const visibility = document.visibilityState;
        input.onLogReload("visibility", { state: visibility });
        if (visibility === "visible") {
          if (areMessagesFresh()) {
            input.onLogReload("load:skip_fresh", {
              reason: "visibility_resume",
              freshnessWindowMs: MESSAGE_RELOAD_FRESHNESS_WINDOW_MS,
            });
            return;
          }
          input.scheduleMessageReload("visibility_resume", 120);
        }
      };

      const handleWindowFocus = () => {
        input.onLogReload("window_focus");
        if (areMessagesFresh()) {
          input.onLogReload("load:skip_fresh", {
            reason: "window_focus",
            freshnessWindowMs: MESSAGE_RELOAD_FRESHNESS_WINDOW_MS,
          });
          return;
        }
        input.scheduleMessageReload("window_focus", 120);
      };

      const handleWindowBlur = () => {
        input.onLogReload("window_blur");
      };

      const start = () => {
        void runMessageMediaMaintenanceForLifecycle();
        cleanupIntervalRef.current = window.setInterval(() => {
          void runMessageMediaMaintenanceForLifecycle();
        }, maintenanceIntervalMs);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);
        window.addEventListener("blur", handleWindowBlur);
      };

      const cleanup = () => {
        if (cleanupIntervalRef.current !== null) {
          window.clearInterval(cleanupIntervalRef.current);
        }
        cleanupIntervalRef.current = null;
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
        window.removeEventListener("focus", handleWindowFocus);
        window.removeEventListener("blur", handleWindowBlur);
      };

      return {
        start,
        cleanup,
      };
    },
    [areMessagesFresh, runMessageMediaMaintenance],
  );

  const createMessageBundleController = React.useCallback(
    (input: MessageBundleControllerInput) => {
      const persistCurrentChannelBundleCache = () => {
        if (!currentServerId || !currentChannelId) return;
        cacheChannelBundle(currentServerId, currentChannelId, {
          messages: currentMessageListRef.current,
          reactions: currentReactionListRef.current,
          attachments: currentAttachmentListRef.current,
          linkPreviews: currentLinkPreviewListRef.current,
          hasOlderMessages: currentHasOlderMessagesRef.current,
        });
      };

      const getCurrentMessageList = () => currentMessageListRef.current;
      const getCurrentReactionList = () => currentReactionListRef.current;
      const getCurrentAttachmentList = () => currentAttachmentListRef.current;
      const getCurrentLinkPreviewList = () => currentLinkPreviewListRef.current;

      const applyLoadedBundle = (inputBundle: {
        messageList: Message[];
        reactionList: MessageReaction[];
        attachmentList: MessageAttachment[];
        linkPreviewList: MessageLinkPreview[];
        hasOlder: boolean;
      }) => {
        currentMessageListRef.current = inputBundle.messageList;
        currentReactionListRef.current = inputBundle.reactionList;
        currentAttachmentListRef.current = inputBundle.attachmentList;
        currentLinkPreviewListRef.current = inputBundle.linkPreviewList;
        syncLoadedMessageWindow(inputBundle.messageList, inputBundle.hasOlder);

        if (input.isMounted()) {
          setStoredMessages(inputBundle.messageList);
          setStoredReactions(inputBundle.reactionList);
          setStoredAttachments(inputBundle.attachmentList);
          setStoredLinkPreviews(inputBundle.linkPreviewList);
          markMessagesFresh();
        }

        persistCurrentChannelBundleCache();
      };

      const hydrateFromCache = () => {
        if (!currentServerId || !currentChannelId) return null;
        const cachedBundle = getCachedChannelBundle(
          currentServerId,
          currentChannelId,
        );
        if (!cachedBundle) return null;

        currentMessageListRef.current = cachedBundle.messages;
        currentReactionListRef.current = cachedBundle.reactions;
        currentAttachmentListRef.current = cachedBundle.attachments;
        currentLinkPreviewListRef.current = cachedBundle.linkPreviews;
        syncLoadedMessageWindow(
          cachedBundle.messages,
          cachedBundle.hasOlderMessages,
        );

        if (input.isMounted()) {
          setStoredMessages(cachedBundle.messages);
          setStoredReactions(cachedBundle.reactions);
          setStoredAttachments(cachedBundle.attachments);
          setStoredLinkPreviews(cachedBundle.linkPreviews);
          input.onMessagesCommitted?.(
            "channel_cache_hydrate",
            cachedBundle.messages,
          );
        }

        return cachedBundle;
      };

      const commitMessages = (nextMessages: Message[], reason: string) => {
        currentMessageListRef.current = nextMessages;
        syncOldestLoadedCursor(nextMessages);
        persistCurrentChannelBundleCache();
        if (!input.isMounted()) return;
        setStoredMessages(nextMessages);
        markMessagesFresh();
        input.onMessagesCommitted?.(reason, nextMessages);
      };

      const commitReactions = (nextReactions: MessageReaction[]) => {
        currentReactionListRef.current = nextReactions;
        persistCurrentChannelBundleCache();
        if (!input.isMounted()) return;
        setStoredReactions(nextReactions);
        markMessagesFresh();
      };

      const commitAttachments = (nextAttachments: MessageAttachment[]) => {
        currentAttachmentListRef.current = nextAttachments;
        persistCurrentChannelBundleCache();
        if (!input.isMounted()) return;
        setStoredAttachments(nextAttachments);
        markMessagesFresh();
      };

      const commitLinkPreviews = (nextLinkPreviews: MessageLinkPreview[]) => {
        currentLinkPreviewListRef.current = nextLinkPreviews;
        persistCurrentChannelBundleCache();
        if (!input.isMounted()) return;
        setStoredLinkPreviews(nextLinkPreviews);
        markMessagesFresh();
      };

      return {
        getCurrentMessageList,
        getCurrentReactionList,
        getCurrentAttachmentList,
        getCurrentLinkPreviewList,
        applyLoadedBundle,
        hydrateFromCache,
        commitMessages,
        commitReactions,
        commitAttachments,
        commitLinkPreviews,
      };
    },
    [
      cacheChannelBundle,
      currentChannelId,
      currentServerId,
      getCachedChannelBundle,
      markMessagesFresh,
      setStoredAttachments,
      setStoredLinkPreviews,
      setStoredMessages,
      setStoredReactions,
      syncLoadedMessageWindow,
      syncOldestLoadedCursor,
    ],
  );

  React.useEffect(() => {
    let isMounted = true;

    if (!currentUserId || !currentServerId || !currentChannelId) {
      resetMessageState();
      setStoredProfiles({});
      return;
    }

    const selectedChannel = channels.find(
      (channel) => channel.id === currentChannelId,
    );
    if (!selectedChannel || selectedChannel.community_id !== currentServerId) {
      resetMessageState();
      setStoredProfiles({});
      return;
    }

    if (selectedChannel.kind !== "text") {
      resetMessageState();
      setStoredProfiles({});
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    let latestAuthorSyncId = 0;

    const logReload = (_event: string, _details?: Record<string, unknown>) => {
      if (!debugChannelReloads) return;
    };

    const updateAuthorProfilesForMessages = async (messageList: Message[]) => {
      const authorIds = Array.from(
        new Set(
          messageList
            .map((message) => message.author_user_id)
            .filter((authorId): authorId is string => Boolean(authorId)),
        ),
      );

      if (authorIds.length === 0) {
        if (!isMounted) return { authorCount: 0, fetchedAuthorCount: 0 };
        setStoredProfiles({});
        return { authorCount: 0, fetchedAuthorCount: 0 };
      }

      const missingAuthorIds = authorIds.filter(
        (authorId) => !authorProfileCacheRef.current[authorId],
      );
      if (missingAuthorIds.length > 0) {
        const fetchedProfiles = await communityBackend.fetchAuthorProfiles(
          currentServerId,
          missingAuthorIds,
        );
        authorProfileCacheRef.current = {
          ...authorProfileCacheRef.current,
          ...fetchedProfiles,
        };
      }

      const profileMap: Record<string, AuthorProfile> = {};
      for (const authorId of authorIds) {
        const cachedProfile = authorProfileCacheRef.current[authorId];
        if (cachedProfile) {
          profileMap[authorId] = cachedProfile;
        }
      }

      if (!isMounted)
        return {
          authorCount: authorIds.length,
          fetchedAuthorCount: missingAuthorIds.length,
        };
      setStoredProfiles(profileMap);
      return {
        authorCount: authorIds.length,
        fetchedAuthorCount: missingAuthorIds.length,
      };
    };

    const scheduleAuthorProfileSyncForMessages = (
      reason: string,
      messageList: Message[],
    ) => {
      const authorSyncId = ++latestAuthorSyncId;
      const messageSnapshot = [...messageList];
      void (async () => {
        try {
          const { authorCount, fetchedAuthorCount } =
            await updateAuthorProfilesForMessages(messageSnapshot);
          if (!isMounted || authorSyncId !== latestAuthorSyncId) return;
          logReload("authors:sync", {
            reason,
            messageCount: messageSnapshot.length,
            authorCount,
            fetchedAuthorCount,
          });
        } catch (error) {
          if (!isMounted || authorSyncId !== latestAuthorSyncId) return;
          console.warn(
            "Failed to sync author profiles after incremental message change:",
            error,
          );
        }
      })();
    };

    const messageBundleController = createMessageBundleController({
      isMounted: () => isMounted,
      onMessagesCommitted: (reason, messageList) => {
        scheduleAuthorProfileSyncForMessages(reason, messageList);
      },
    });

    const updateMessageBundleState = async (inputBundle: {
      reason: string;
      loadId: number;
      startedAt: number;
      messageList: Message[];
      reactionList: MessageReaction[];
      attachmentList: MessageAttachment[];
      linkPreviewList: MessageLinkPreview[];
      hasOlder: boolean;
    }) => {
      if (!isMounted || !isCurrentMessageLoad(inputBundle.loadId)) return;

      messageBundleController.applyLoadedBundle({
        messageList: inputBundle.messageList,
        reactionList: inputBundle.reactionList,
        attachmentList: inputBundle.attachmentList,
        linkPreviewList: inputBundle.linkPreviewList,
        hasOlder: inputBundle.hasOlder,
      });

      const { authorCount, fetchedAuthorCount } =
        await updateAuthorProfilesForMessages(inputBundle.messageList);
      if (!isMounted || !isCurrentMessageLoad(inputBundle.loadId)) return;

      logReload("load:success", {
        reason: inputBundle.reason,
        loadId: inputBundle.loadId,
        durationMs: Date.now() - inputBundle.startedAt,
        messageCount: inputBundle.messageList.length,
        authorCount,
        fetchedAuthorCount,
        hasOlderMessages: inputBundle.hasOlder,
      });
    };

    const commitMessages = messageBundleController.commitMessages;
    const commitReactions = messageBundleController.commitReactions;
    const commitAttachments = messageBundleController.commitAttachments;
    const commitLinkPreviews = messageBundleController.commitLinkPreviews;

    const loadMessages = async (reason: string) => {
      let loadId: number | null = null;
      let startedAt = Date.now();
      try {
        const loadedBundle = await loadLatestMessagesWithRelated(
          messageBundleController.getCurrentMessageList().length,
        );
        loadId = loadedBundle.loadId;
        startedAt = loadedBundle.startedAt;
        logReload("load:start", { reason, loadId });

        await updateMessageBundleState({
          reason,
          loadId: loadedBundle.loadId,
          startedAt: loadedBundle.startedAt,
          messageList: loadedBundle.messageList,
          reactionList: loadedBundle.reactionList,
          attachmentList: loadedBundle.attachmentList,
          linkPreviewList: loadedBundle.linkPreviewList,
          hasOlder: loadedBundle.hasOlder,
        });
      } catch (error) {
        if (loadId == null) {
          if (isMounted) {
            console.error("Error loading messages:", error);
          }
          return;
        }
        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        console.error("Error loading messages:", error);
        logReload("load:error", {
          reason,
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const loadOlderMessages = async () => {
      if (!isMounted) return;
      let loadResult: Awaited<
        ReturnType<typeof loadOlderMessagesWithRelated>
      > | null = null;
      let loadId: number | null = null;
      let startedAt = Date.now();

      try {
        loadResult = await loadOlderMessagesWithRelated(
          messageBundleController.getCurrentMessageList(),
        );
        if (loadResult.kind === "skipped") return;

        loadId = loadResult.loadId;
        startedAt = loadResult.startedAt;
        logReload("load-older:start", {
          loadId,
          cursorCreatedAt: loadResult.oldestLoadedCursor.createdAt,
          cursorId: loadResult.oldestLoadedCursor.id,
          currentMessageCount:
            messageBundleController.getCurrentMessageList().length,
        });

        if (loadResult.kind === "no_more") {
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;
          syncLoadedMessageWindow(
            messageBundleController.getCurrentMessageList(),
            false,
          );
          logReload("load-older:complete", {
            loadId,
            addedCount: 0,
            durationMs: Date.now() - startedAt,
            hasOlderMessages: false,
          });
          return;
        }

        await updateMessageBundleState({
          reason: "load_older",
          loadId,
          startedAt,
          messageList: loadResult.messageList,
          reactionList: loadResult.reactionList,
          attachmentList: loadResult.attachmentList,
          linkPreviewList: loadResult.linkPreviewList,
          hasOlder: loadResult.hasOlder,
        });

        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        logReload("load-older:complete", {
          loadId,
          addedCount: loadResult.prependCount,
          durationMs: Date.now() - startedAt,
          hasOlderMessages: loadResult.hasOlder,
        });
      } catch (error) {
        if (loadId == null) {
          if (isMounted) {
            console.error("Error loading older messages:", error);
          }
          return;
        }
        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        console.error("Error loading older messages:", error);
        logReload("load-older:error", {
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        finishOlderMessagesLoad({ updateUi: isMounted });
      }
    };

    setRequestOlderMessagesLoader(loadOlderMessages);

    const messageReloadScheduler = createMessageReloadScheduler({
      isMounted: () => isMounted,
      onLoadMessages: loadMessages,
      onLogReload: logReload,
    });

    const incrementalRelatedRefreshQueues =
      createIncrementalRelatedRefreshQueues({
        isMounted: () => isMounted,
        getCurrentMessageList: messageBundleController.getCurrentMessageList,
        getCurrentAttachmentList:
          messageBundleController.getCurrentAttachmentList,
        getCurrentLinkPreviewList:
          messageBundleController.getCurrentLinkPreviewList,
        commitAttachments,
        commitLinkPreviews,
        onAttachmentRefreshFallback: (error) => {
          console.warn(
            "Failed to incrementally refresh message attachments:",
            error,
          );
          messageReloadScheduler.scheduleMessageReload(
            "attachments_sub_fallback",
            20,
          );
        },
        onLinkPreviewRefreshFallback: (error) => {
          console.warn(
            "Failed to incrementally refresh message link previews:",
            error,
          );
          messageReloadScheduler.scheduleMessageReload(
            "previews_sub_fallback",
            20,
          );
        },
      });

    const messageReloadLifecycle = createMessageReloadLifecycle({
      isMounted: () => isMounted,
      scheduleMessageReload: messageReloadScheduler.scheduleMessageReload,
      onLogReload: logReload,
    });

    const hydratedBundle = messageBundleController.hydrateFromCache();
    if (hydratedBundle) {
      logReload("cache:hydrate", {
        messageCount: hydratedBundle.messages.length,
        hasOlderMessages: hydratedBundle.hasOlderMessages,
      });
    }
    messageReloadLifecycle.start();
    messageReloadScheduler.scheduleMessageReload("initial", 0);

    const cleanupRealtimeMessageStreams = subscribeToMessageRealtimeStreams({
      onMessagePayload: (payload) => {
        const handled = applyIncrementalMessageRealtimePayload({
          payload,
          currentMessageList: messageBundleController.getCurrentMessageList(),
          currentReactionList: messageBundleController.getCurrentReactionList(),
          currentAttachmentList:
            messageBundleController.getCurrentAttachmentList(),
          currentLinkPreviewList:
            messageBundleController.getCurrentLinkPreviewList(),
          commitMessages,
          commitReactions,
          commitAttachments,
          commitLinkPreviews,
        });
        if (!handled) {
          messageReloadScheduler.scheduleMessageReload("messages_sub_fallback");
        }
      },
      onReactionPayload: (payload) => {
        const handled = applyIncrementalReactionRealtimePayload({
          payload,
          currentMessageList: messageBundleController.getCurrentMessageList(),
          currentReactionList: messageBundleController.getCurrentReactionList(),
          commitReactions,
        });
        if (!handled) {
          messageReloadScheduler.scheduleMessageReload(
            "reactions_sub_fallback",
          );
        }
      },
      onAttachmentPayload: (payload) => {
        const messageId = getAffectedMessageIdFromRealtimePayload(
          payload,
          messageBundleController
            .getCurrentAttachmentList()
            .map((row) => ({ id: row.id, messageId: row.messageId })),
        );
        if (!messageId) {
          messageReloadScheduler.scheduleMessageReload(
            "attachments_sub_fallback",
          );
          return;
        }
        incrementalRelatedRefreshQueues.queueAttachmentRefresh(messageId);
      },
      onLinkPreviewPayload: (payload) => {
        const messageId = getAffectedMessageIdFromRealtimePayload(
          payload,
          messageBundleController
            .getCurrentLinkPreviewList()
            .map((row) => ({ id: row.id, messageId: row.messageId })),
        );
        if (!messageId) {
          messageReloadScheduler.scheduleMessageReload("previews_sub_fallback");
          return;
        }
        incrementalRelatedRefreshQueues.queueLinkPreviewRefresh(messageId);
      },
    });

    return () => {
      isMounted = false;
      clearRequestOlderMessagesLoader();
      messageReloadScheduler.cleanup();
      incrementalRelatedRefreshQueues.cleanup();
      cleanupRealtimeMessageStreams();
      messageReloadLifecycle.cleanup();
    };
  }, [
    currentUserId,
    currentServerId,
    currentChannelId,
    debugChannelReloads,
    channels,
    resetMessageState,
    setStoredProfiles,
    authorProfileCacheRef,
    isCurrentMessageLoad,
    syncLoadedMessageWindow,
    loadLatestMessagesWithRelated,
    loadOlderMessagesWithRelated,
    getAffectedMessageIdFromRealtimePayload,
    applyIncrementalMessageRealtimePayload,
    applyIncrementalReactionRealtimePayload,
    subscribeToMessageRealtimeStreams,
    createIncrementalRelatedRefreshQueues,
    createMessageReloadScheduler,
    createMessageReloadLifecycle,
    createMessageBundleController,
    finishOlderMessagesLoad,
    setRequestOlderMessagesLoader,
    clearRequestOlderMessagesLoader,
  ]);

  const messagesStoreState = useMessagesStore.getState();

  return {
    state: {
      hasOlderMessages: messagesStoreState.hasMore,
      isLoadingOlderMessages: messagesStoreState.isLoading,
    },
    derived: {},
    actions: {
      resetMessageState,
      requestOlderMessages,
      sendMessage,
      toggleMessageReaction,
      editMessage,
      deleteMessage,
      reportMessage,
      requestMessageLinkPreviewRefresh,
      prefetchChannelMessages,
      purgeMessageBundleCacheForServer,
      purgeMessageBundleCacheForChannel,
      applyChannelAccessRevokedContentVisibility,
    },
  };
}
