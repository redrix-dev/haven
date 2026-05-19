import React, { useRef } from "react";
import { dataCacheDebug } from "@shared/debug";
import { getCommunityDataBackend } from "@shared/lib/backend";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import { CHANNEL_BUNDLE_STALE_MS, MESSAGE_PAGE_SIZE } from "@shared/infrastructure/constants";
import type { ChannelMessageBundleSyncMetadata } from "@shared/types/types";
import {
  applyChannelAccessVisibilityToMessageBundle,
  filterBlockedUserContent,
} from "@shared/features/messaging/lib/banVisibility";
import {
  messageReloadReasonsRequireFullLoad,
  parseMessageReloadReasons,
} from "@shared/features/messaging/lib/mergeMessageBundle";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useSocialStore } from "@shared/stores/socialStore";
import type {
  Message,
  MessageAttachment,
  MessageBundle,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { asRecord } from "@platform/lib/records";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { getAppHost } from "@shared/infrastructure/platform/appHost";

const MESSAGE_RELOAD_FRESHNESS_WINDOW_MS = 10_000;

type CachedChannelBundles = {
  bundles: MessageBundle[];
  hasOlderMessages: boolean;
  syncMetadata?: ChannelMessageBundleSyncMetadata;
};

/**
 * Message bundle + revocation caches shared across all `useMessages`
 * hook instances so navigation that unmounts the host screen (e.g. mobile Home
 * ↔ Community) does not discard warm channel data.
 */
const crossSessionMessageBundleByChannel: Record<string, CachedChannelBundles> =
  Object.create(null);
const crossSessionRevokedUserIdsByChannel: Record<string, string[]> =
  Object.create(null);
const crossSessionLoadedRevokedUserIdsByChannel: Record<string, boolean> =
  Object.create(null);

/** Clears cross-session caches; call on sign-out or account switch. */
export function clearCrossSessionMessagingCaches(): void {
  dataCacheDebug.cacheWrite("useMessages", "clearCrossSessionMessagingCaches");
  for (const key of Object.keys(crossSessionMessageBundleByChannel)) {
    delete crossSessionMessageBundleByChannel[key];
  }
  for (const key of Object.keys(crossSessionRevokedUserIdsByChannel)) {
    delete crossSessionRevokedUserIdsByChannel[key];
  }
  for (const key of Object.keys(crossSessionLoadedRevokedUserIdsByChannel)) {
    delete crossSessionLoadedRevokedUserIdsByChannel[key];
  }
}

function getChannelBundleCacheKey(communityId: string, channelId: string): string {
  return `${communityId}:${channelId}`;
}

export function getCachedMessageBundlesForChannel(
  communityId: string,
  channelId: string,
): CachedChannelBundles | null {
  const cacheKey = getChannelBundleCacheKey(communityId, channelId);
  const hit = crossSessionMessageBundleByChannel[cacheKey] ?? null;
  dataCacheDebug.cacheRead("useMessages", hit ? "message bundle hit" : "message bundle miss", {
    cacheKey,
    bundleCount: hit?.bundles.length ?? 0,
  });
  return hit;
}

export type PrefetchCommunityChannelMessagesInput = {
  serverId: string;
  channelId: string;
  currentUserId: string | null;
};

/** Warms the cross-session message cache (mobile home grid prefetch, etc.). */
export async function prefetchCommunityChannelMessages({
  serverId,
  channelId,
  currentUserId,
}: PrefetchCommunityChannelMessagesInput): Promise<void> {
  const cacheKey = getChannelBundleCacheKey(serverId, channelId);
  if (crossSessionMessageBundleByChannel[cacheKey]) {
    dataCacheDebug.cacheRead("useMessages", "prefetch skip — already cached", { cacheKey });
    return;
  }

  dataCacheDebug.fetch("useMessages", "prefetchCommunityChannelMessages start", {
    serverId,
    channelId,
  });

  try {
    const communityBackend = getCommunityDataBackend(serverId);
    const result = await communityBackend.listChannelMessages({
      communityId: serverId,
      channelId,
      limit: MESSAGE_PAGE_SIZE,
      beforeCreatedAt: null,
      beforeMessageId: null,
    });
    const asc = [...result.messages].reverse();

    const revocationKey = getChannelBundleCacheKey(serverId, channelId);
    let revokedUserIds: string[] = [];
    if (
      Object.prototype.hasOwnProperty.call(
        crossSessionRevokedUserIdsByChannel,
        revocationKey,
      ) &&
      crossSessionLoadedRevokedUserIdsByChannel[revocationKey] === true
    ) {
      revokedUserIds = crossSessionRevokedUserIdsByChannel[revocationKey] ?? [];
    } else {
      revokedUserIds = await communityBackend.listChannelRevokedUserIds({
        communityId: serverId,
        channelId,
      });
      crossSessionRevokedUserIdsByChannel[revocationKey] = revokedUserIds;
      crossSessionLoadedRevokedUserIdsByChannel[revocationKey] = true;
    }

    const blockedUserIds = useSocialStore.getState().blockedUserIds;
    const isElevated = currentUserId
      ? await usePermissionsStore
          .getState()
          .ensureElevatedInServer(
            serverId,
            currentUserId,
            getCommunityDataBackend(serverId),
          )
      : false;

    const filtered = applyVisibilityToBundles(asc, {
      communityId: serverId,
      channelId,
      revokedUserIds,
      blockedUserIds,
      isElevatedInServer: isElevated,
    });

    if (!crossSessionMessageBundleByChannel[cacheKey]) {
      crossSessionMessageBundleByChannel[cacheKey] = {
        bundles: filtered,
        hasOlderMessages: result.hasMore,
        syncMetadata: {
          lastSuccessfulSyncAt: new Date().toISOString(),
          newestMessageCursor: computeNewestMessageBundleCursor(filtered),
        },
      };
      dataCacheDebug.cacheWrite("useMessages", "prefetchCommunityChannelMessages cached", {
        cacheKey,
        bundleCount: filtered.length,
        hasMore: result.hasMore,
      });
    }
  } catch (error) {
    dataCacheDebug.fetch(
      "useMessages",
      "prefetchCommunityChannelMessages failed",
      { cacheKey, error: String(error) },
      "warn",
    );
  }
}

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

const compareMessageBundlesAsc = (
  left: MessageBundle,
  right: MessageBundle,
): number => {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
};

const computeNewestMessageBundleCursor = (
  bundles: MessageBundle[],
): { createdAt: string; id: string } | null => {
  if (bundles.length === 0) return null;
  const last = bundles[bundles.length - 1];
  return { createdAt: last.createdAt, id: last.id };
};

const mergeBundlesById = (
  existing: MessageBundle[],
  incoming: MessageBundle[],
): MessageBundle[] => {
  const byId = new Map<string, MessageBundle>();
  for (const b of existing) {
    byId.set(b.id, b);
  }
  for (const b of incoming) {
    byId.set(b.id, b);
  }
  return Array.from(byId.values()).sort(compareMessageBundlesAsc);
};

type BanShape = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
};

const bundleToMessage = (
  bundle: MessageBundle,
  communityId: string,
  channelId: string,
): Message => {
  const metadata: Record<string, unknown> = {
    ...bundle.metadata,
    ...(bundle.replyToMessageId
      ? { replyToMessageId: bundle.replyToMessageId }
      : {}),
  };
  return {
    id: bundle.id,
    community_id: communityId,
    channel_id: channelId,
    author_user_id: bundle.authorUserId,
    content: bundle.content,
    metadata: metadata as Message["metadata"],
    created_at: bundle.createdAt,
    edited_at: bundle.editedAt,
    deleted_at: bundle.deletedAt,
    is_hidden: bundle.isHidden,
  } as Message;
};

const messageBundlesToBanShape = (
  bundles: MessageBundle[],
  communityId: string,
  channelId: string,
): BanShape => ({
  messages: bundles.map((b) => bundleToMessage(b, communityId, channelId)),
  reactions: bundles.flatMap((b) => b.reactions),
  attachments: bundles.flatMap((b) => (b.attachment ? [b.attachment] : [])),
  linkPreviews: bundles.flatMap((b) => (b.linkPreview ? [b.linkPreview] : [])),
});

const banShapeToBundles = (
  filtered: BanShape,
  originalsById: Map<string, MessageBundle>,
): MessageBundle[] =>
  filtered.messages.map((msg) => {
    const orig = originalsById.get(msg.id);
    const reactions = filtered.reactions.filter((r) => r.messageId === msg.id);
    const atts = filtered.attachments.filter((a) => a.messageId === msg.id);
    const attachment = atts.length > 0 ? atts[0] : null;
    const lps = filtered.linkPreviews.filter((p) => p.messageId === msg.id);
    const linkPreview = lps.length > 0 ? lps[0] : null;
    const base =
      orig ??
      ({
        id: msg.id,
        channelId: msg.channel_id,
        authorUserId: msg.author_user_id,
        displayName: "Unknown",
        avatarSnapshotUrl: null,
        content: msg.content,
        metadata: (msg.metadata as Record<string, unknown>) ?? {},
        replyToMessageId: null,
        createdAt: msg.created_at,
        editedAt: msg.edited_at ?? null,
        deletedAt: msg.deleted_at ?? null,
        isHidden: Boolean(msg.is_hidden),
        isPlatformStaff: false,
        reactions: [],
        attachment: null,
        linkPreview: null,
      } satisfies MessageBundle);
    return {
      ...base,
      authorUserId: msg.author_user_id,
      content: msg.content,
      metadata: (msg.metadata as Record<string, unknown>) ?? {},
      editedAt: msg.edited_at ?? null,
      deletedAt: msg.deleted_at ?? null,
      isHidden: Boolean(msg.is_hidden),
      reactions,
      attachment,
      linkPreview,
    };
  });

const applyVisibilityToBundles = (
  bundles: MessageBundle[],
  input: {
    communityId: string;
    channelId: string;
    revokedUserIds: string[];
    blockedUserIds: ReadonlySet<string>;
    isElevatedInServer: boolean;
  },
): MessageBundle[] => {
  const originalsById = new Map(bundles.map((b) => [b.id, b]));
  const shape = messageBundlesToBanShape(
    bundles,
    input.communityId,
    input.channelId,
  );
  let next = applyChannelAccessVisibilityToMessageBundle(shape, {
    channelId: input.channelId,
    revokedUserIds: input.revokedUserIds,
  });
  next = filterBlockedUserContent(
    next,
    input.blockedUserIds,
    input.isElevatedInServer,
  );
  return banShapeToBundles(next, originalsById);
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

const parseAttachmentFromRow = (
  row: Record<string, unknown> | null,
): MessageAttachment | null => {
  if (!row) return null;
  const id = getStringField(row, "id");
  const messageId = getStringField(row, "message_id");
  const communityId = getStringField(row, "community_id");
  const channelId = getStringField(row, "channel_id");
  const ownerUserId = getStringField(row, "owner_user_id");
  const bucketName = getStringField(row, "bucket_name");
  const objectPath = getStringField(row, "object_path");
  const mimeType = getStringField(row, "mime_type");
  const mediaKind = row.media_kind;
  const sizeBytes = typeof row.size_bytes === "number" ? row.size_bytes : null;
  const createdAt = getStringField(row, "created_at");
  const expiresAt = getStringField(row, "expires_at");
  if (
    !id ||
    !messageId ||
    !communityId ||
    !channelId ||
    !ownerUserId ||
    !bucketName ||
    !objectPath ||
    !mimeType ||
    (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "file") ||
    sizeBytes == null ||
    !createdAt ||
    !expiresAt
  ) {
    return null;
  }
  return {
    id,
    messageId,
    communityId,
    channelId,
    ownerUserId,
    bucketName,
    objectPath,
    originalFilename: getNullableStringField(row, "original_filename"),
    mimeType,
    mediaKind,
    sizeBytes,
    createdAt,
    expiresAt,
    signedUrl: null,
  };
};

const signRealtimeMessageAttachment = async (
  backend: CommunityDataBackend,
  communityId: string,
  channelId: string,
  att: MessageAttachment,
): Promise<MessageAttachment> => {
  try {
    const signedList = await backend.listMessageAttachments(
      communityId,
      channelId,
    );
    const match = signedList.find((a) => a.id === att.id);
    if (match) return match;
  } catch (signedError) {
    console.error("Failed to sign realtime message attachment:", signedError);
  }
  return { ...att, signedUrl: null };
};

const parseLinkPreviewFromRow = (
  row: Record<string, unknown> | null,
): MessageLinkPreview | null => {
  if (!row) return null;
  const id = getStringField(row, "id");
  const messageId = getStringField(row, "message_id");
  const communityId = getStringField(row, "community_id");
  const channelId = getStringField(row, "channel_id");
  const createdAt = getStringField(row, "created_at");
  const updatedAt = getStringField(row, "updated_at");
  const status = row.status;
  const embedProvider = row.embed_provider;
  if (
    !id ||
    !messageId ||
    !communityId ||
    !channelId ||
    !createdAt ||
    !updatedAt ||
    (status !== "pending" &&
      status !== "ready" &&
      status !== "unsupported" &&
      status !== "failed") ||
    (embedProvider !== "none" &&
      embedProvider !== "youtube" &&
      embedProvider !== "vimeo")
  ) {
    return null;
  }
  return {
    id,
    messageId,
    communityId,
    channelId,
    sourceUrl: getNullableStringField(row, "source_url"),
    normalizedUrl: getNullableStringField(row, "normalized_url"),
    status,
    cacheId: getNullableStringField(row, "cache_id"),
    snapshot: null,
    embedProvider,
    thumbnailBucketName: getNullableStringField(row, "thumbnail_bucket_name"),
    thumbnailObjectPath: getNullableStringField(row, "thumbnail_object_path"),
    createdAt,
    updatedAt,
  };
};

const rawMessageRowToBundle = (
  row: Record<string, unknown>,
  communityId: string,
  channelId: string,
): MessageBundle | null => {
  const id = getStringField(row, "id");
  if (!id) return null;
  const replyCol = getNullableStringField(row, "reply_to_message_id");
  const metadataBase = asRecord(row.metadata) ?? {};
  const metadata: Record<string, unknown> = {
    ...metadataBase,
    ...(replyCol ? { replyToMessageId: replyCol } : {}),
  };
  return {
    id,
    channelId,
    authorUserId: getNullableStringField(row, "author_user_id"),
    displayName:
      typeof row.display_name === "string" && row.display_name.trim().length > 0
        ? row.display_name
        : "Unknown",
    avatarSnapshotUrl: getNullableStringField(row, "avatar_snapshot_url"),
    content: typeof row.content === "string" ? row.content : "",
    metadata,
    replyToMessageId: replyCol,
    createdAt: getStringField(row, "created_at") ?? "",
    editedAt: getNullableStringField(row, "edited_at"),
    deletedAt: getNullableStringField(row, "deleted_at"),
    isHidden: Boolean(row.is_hidden),
    isPlatformStaff: row.is_platform_staff === true,
    reactions: [],
    attachment: null,
    linkPreview: null,
  };
};

const coerceMediaExpiresInHours = (
  value: number | undefined,
): 1 | 24 | 168 | 720 => {
  if (value === 1 || value === 24 || value === 168 || value === 720) return value;
  return 24;
};

type UseMessagesInput = {
  currentServerId: string | null;
  currentChannelId: string | null;
  currentUserId: string | null;
  isCurrentUserElevatedInServer: boolean;
  debugChannelReloads: boolean;
  channels: import("@shared/lib/backend/types").Channel[];
};

export function useMessages({
  currentServerId,
  currentChannelId,
  currentUserId,
  isCurrentUserElevatedInServer,
  debugChannelReloads,
  channels,
}: UseMessagesInput) {
  const blockedUserIds = useSocialStore((state) => state.blockedUserIds);
  const requestOlderMessagesRef = React.useRef<(() => Promise<void>) | null>(
    null,
  );
  const messageBundleByChannelCacheRef = React.useRef(
    crossSessionMessageBundleByChannel,
  );
  const latestLoadIdRef = React.useRef(0);
  const olderLoadInFlightRef = React.useRef(false);
  const currentHasOlderMessagesRef = React.useRef(false);
  const oldestLoadedCursorRef = React.useRef<{
    createdAt: string;
    id: string;
  } | null>(null);
  const currentBundlesRef = React.useRef<MessageBundle[]>([]);
  const revokedUserIdsByChannelRef = React.useRef(
    crossSessionRevokedUserIdsByChannel,
  );
  const loadedRevokedUserIdsByChannelRef = React.useRef(
    crossSessionLoadedRevokedUserIdsByChannel,
  );
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeVisibilityListenerRef = useRef<(() => void) | null>(null);
  const unsubscribeFocusListenerRef = useRef<(() => void) | null>(null);
  const unsubscribeBlurListenerRef = useRef<(() => void) | null>(null);
  const lastFreshMessageLoadAtRef = React.useRef(0);
  const lastEffectArmKeyRef = React.useRef<string | null>(null);

  const hasOlderMessages = useMessagesStore((s) => s.hasMore);
  const isLoadingOlderMessages = useMessagesStore((s) => s.isLoading);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = React.useState(false);

  const setStoredMessages = React.useCallback((bundles: MessageBundle[]) => {
    useMessagesStore.getState().setMessages(bundles);
  }, []);

  const setStoredIsLoading = React.useCallback((isLoading: boolean) => {
    useMessagesStore.getState().setIsLoading(isLoading);
  }, []);

  const setStoredHasMore = React.useCallback((hasMore: boolean) => {
    useMessagesStore.getState().setHasMore(hasMore);
  }, []);

  const resetStoredMessages = React.useCallback(() => {
    useMessagesStore.getState().reset();
  }, []);

  const updateMessageBundle = React.useCallback(
    (id: string, updater: (bundle: MessageBundle) => MessageBundle) => {
      useMessagesStore.getState().updateMessageBundle(id, updater);
    },
    [],
  );

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

  const getCachedChannelBundles = React.useCallback(
    (communityId: string, channelId: string): CachedChannelBundles | null => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      return messageBundleByChannelCacheRef.current[cacheKey] ?? null;
    },
    [getChannelBundleCacheKey],
  );

  const cacheChannelBundles = React.useCallback(
    (communityId: string, channelId: string, entry: CachedChannelBundles) => {
      const cacheKey = getChannelBundleCacheKey(communityId, channelId);
      const prev = messageBundleByChannelCacheRef.current[cacheKey];
      const syncMetadata = entry.syncMetadata ?? prev?.syncMetadata;
      messageBundleByChannelCacheRef.current[cacheKey] = {
        ...entry,
        syncMetadata,
      };
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
        const result = await communityBackend.listChannelMessages({
          communityId: serverId,
          channelId,
          limit: MESSAGE_PAGE_SIZE,
          beforeCreatedAt: null,
          beforeMessageId: null,
        });
        const asc = [...result.messages].reverse();
        const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
          serverId,
          channelId,
        );
        const filtered = applyVisibilityToBundles(asc, {
          communityId: serverId,
          channelId,
          revokedUserIds,
          blockedUserIds,
          isElevatedInServer:
            await usePermissionsStore
              .getState()
              .ensureElevatedInServer(
                serverId,
                currentUserId,
                getCommunityDataBackend(serverId),
              ),
        });
        if (!messageBundleByChannelCacheRef.current[cacheKey]) {
          cacheChannelBundles(serverId, channelId, {
            bundles: filtered,
            hasOlderMessages: result.hasMore,
            syncMetadata: {
              lastSuccessfulSyncAt: new Date().toISOString(),
              newestMessageCursor: computeNewestMessageBundleCursor(filtered),
            },
          });
        }
      } catch (e) {
        // silent — prefetch failures are non-fatal
        void e;
      }
    },
    [
      blockedUserIds,
      cacheChannelBundles,
      currentUserId,
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

  const syncOldestLoadedCursor = React.useCallback((bundles: MessageBundle[]) => {
    oldestLoadedCursorRef.current =
      bundles.length > 0
        ? { createdAt: bundles[0].createdAt, id: bundles[0].id }
        : null;
  }, []);

  const syncLoadedMessageWindow = React.useCallback(
    (bundles: MessageBundle[], hasOlder: boolean) => {
      currentHasOlderMessagesRef.current = hasOlder;
      oldestLoadedCursorRef.current =
        bundles.length > 0
          ? { createdAt: bundles[0].createdAt, id: bundles[0].id }
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
  }, [setStoredIsLoading]);

  const finishOlderMessagesLoad = React.useCallback(
    (options?: { updateUi?: boolean }) => {
      olderLoadInFlightRef.current = false;
      if (options?.updateUi === false) return;
      setStoredIsLoading(false);
    },
    [setStoredIsLoading],
  );

  const clearAuthorProfileCache = React.useCallback(() => {
    /* legacy no-op — profiles removed from message store */
  }, []);

  const resetMessageState = React.useCallback(() => {
    resetStoredMessages();
    setHasCompletedInitialLoad(false);
    latestLoadIdRef.current = 0;
    olderLoadInFlightRef.current = false;
    currentHasOlderMessagesRef.current = false;
    oldestLoadedCursorRef.current = null;
    currentBundlesRef.current = [];
    lastFreshMessageLoadAtRef.current = 0;
    requestOlderMessagesRef.current = null;
  }, [resetStoredMessages]);

  const { setRainbowMode } = useUserStatusStore();
  const sendMessage = React.useCallback(
    async (
      content: string,
      options?: {
        replyToMessageId?: string;
        mediaFile?: Blob | File;
        mediaArrayBuffer?: ArrayBuffer;
        mediaContentType?: string;
        mediaFilename?: string;
        mediaExpiresInHours?: number;
      },
    ) => {
      if (content === "#RainbowRoad") {
        setRainbowMode(!useUserStatusStore.getState().rainbowMode);
        return;
      }
      if (!currentUserId || !currentChannelId || !currentServerId) return;

      const hasBlob = options?.mediaFile != null;
      const hasBuffer = options?.mediaArrayBuffer != null;
      if (hasBlob && hasBuffer) {
        throw new Error("Cannot send both mediaFile and mediaArrayBuffer.");
      }
      if (hasBuffer && !options.mediaContentType?.trim()) {
        throw new Error("mediaContentType is required when sending mediaArrayBuffer.");
      }

      const communityBackend = getCommunityDataBackend(currentServerId);
      const inferredMediaFilename =
        options?.mediaFilename ??
        (options?.mediaFile && "name" in options.mediaFile
          ? String(options.mediaFile.name)
          : undefined) ??
        `upload-${Date.now()}`;

      if (hasBlob || hasBuffer) {
        const fileBody = hasBuffer
          ? (options!.mediaArrayBuffer as ArrayBuffer)
          : (options!.mediaFile as Blob);
        const upload = await communityBackend.uploadMessageMedia({
          communityId: currentServerId,
          channelId: currentChannelId,
          file: fileBody,
          filename: inferredMediaFilename,
          mimeType:
            options?.mediaContentType?.trim() ??
            (options?.mediaFile instanceof Blob
              ? options.mediaFile.type || "application/octet-stream"
              : "application/octet-stream"),
          expiresInHours: coerceMediaExpiresInHours(options?.mediaExpiresInHours),
          contentType:
            options?.mediaContentType?.trim() ??
            (options?.mediaFile instanceof Blob
              ? options.mediaFile.type || undefined
              : undefined),
        });
        const { id } = await communityBackend.sendUserMessage({
          communityId: currentServerId,
          channelId: currentChannelId,
          content,
          replyToMessageId: options?.replyToMessageId ?? null,
        });
        try {
          await communityBackend.insertMessageAttachment({
            messageId: id,
            communityId: currentServerId,
            channelId: currentChannelId,
            objectPath: upload.objectPath,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
            mediaKind: upload.mediaKind,
            filename: inferredMediaFilename,
            expiresAt: upload.expiresAt,
          });
        } catch (e) {
          await communityBackend.deleteMessage({ messageId: id });
          throw e;
        }
        return;
      }

      await communityBackend.sendUserMessage({
        communityId: currentServerId,
        channelId: currentChannelId,
        content,
        replyToMessageId: options?.replyToMessageId ?? null,
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
      const next = useMessagesStore
        .getState()
        .messages.filter((b) => b.id !== messageId);
      currentBundlesRef.current = next;
      syncOldestLoadedCursor(next);

      if (currentChannelId) {
        cacheChannelBundles(currentServerId, currentChannelId, {
          bundles: next,
          hasOlderMessages: currentHasOlderMessagesRef.current,
        });
      }

      setStoredMessages(next);
      markMessagesFresh();
    },
    [
      cacheChannelBundles,
      currentChannelId,
      currentServerId,
      markMessagesFresh,
      setStoredMessages,
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
      const cached = messageBundleByChannelCacheRef.current[cacheKey];
      if (cached) {
        const filtered = applyVisibilityToBundles(cached.bundles, {
          communityId: input.communityId,
          channelId: input.channelId,
          revokedUserIds,
          blockedUserIds,
          isElevatedInServer: isCurrentUserElevatedInServer,
        });
        messageBundleByChannelCacheRef.current[cacheKey] = {
          ...cached,
          bundles: filtered,
        };
      }

      if (
        currentServerId !== input.communityId ||
        currentChannelId !== input.channelId
      )
        return;

      const filtered = applyVisibilityToBundles(currentBundlesRef.current, {
        communityId: input.communityId,
        channelId: input.channelId,
        revokedUserIds,
        blockedUserIds,
        isElevatedInServer: isCurrentUserElevatedInServer,
      });
      currentBundlesRef.current = filtered;
      syncLoadedMessageWindow(
        filtered,
        currentHasOlderMessagesRef.current,
      );
      setStoredMessages(filtered);
      markMessagesFresh();
    },
    [
      addChannelRevokedUserIdToCache,
      blockedUserIds,
      currentChannelId,
      currentServerId,
      getChannelBundleCacheKey,
      isCurrentUserElevatedInServer,
      markMessagesFresh,
      setStoredMessages,
      syncLoadedMessageWindow,
    ],
  );

  React.useEffect(() => {
    let isMounted = true;

    if (!currentUserId || !currentServerId || !currentChannelId) {
      dataCacheDebug.lifecycle("useMessages", "effect bail — missing ids", {
        currentUserId: Boolean(currentUserId),
        currentServerId,
        currentChannelId,
      });
      if (currentServerId && !currentChannelId) {
        return;
      }
      resetMessageState();
      return;
    }

    const selectedChannel = channels.find(
      (channel) => channel.id === currentChannelId,
    );
    const channelListReady = channels.length > 0;

    if (channelListReady) {
      if (!selectedChannel || selectedChannel.community_id !== currentServerId) {
        dataCacheDebug.lifecycle("useMessages", "effect bail — channel mismatch", {
          currentServerId,
          currentChannelId,
          channelListReady,
          channelsCount: channels.length,
          selectedChannelCommunityId: selectedChannel?.community_id ?? null,
        });
        return;
      }
      if (selectedChannel.kind !== "text") {
        dataCacheDebug.lifecycle("useMessages", "effect bail — non-text channel", {
          currentChannelId,
          kind: selectedChannel.kind,
        });
        resetMessageState();
        return;
      }
    } else if (!getCachedChannelBundles(currentServerId, currentChannelId)) {
      dataCacheDebug.lifecycle("useMessages", "effect bail — channels empty, no cache", {
        currentServerId,
        currentChannelId,
      });
      resetMessageState();
      return;
    }

    const effectArmKey = `${currentServerId}:${currentChannelId}`;
    if (lastEffectArmKeyRef.current === effectArmKey) {
      dataCacheDebug.lifecycle("useMessages", "effect skip — already armed", {
        effectArmKey,
      });
      return;
    }
    lastEffectArmKeyRef.current = effectArmKey;

    dataCacheDebug.fetch("useMessages", "effect armed", {
      currentServerId,
      currentChannelId,
      channelListReady,
      channelsCount: channels.length,
    });

    const communityBackend = getCommunityDataBackend(currentServerId);

    const logReload = (_event: string, _details?: Record<string, unknown>) => {
      if (!debugChannelReloads) return;
    };

    const persistCurrentChannelBundleCache = (
      syncTouch: "http_success" | "realtime",
    ) => {
      if (!currentServerId || !currentChannelId) return;
      const bundles = currentBundlesRef.current;
      const newest = computeNewestMessageBundleCursor(bundles);
      const prev = getCachedChannelBundles(currentServerId, currentChannelId);
      const prevSync = prev?.syncMetadata;
      const syncMetadata =
        syncTouch === "http_success"
          ? {
              lastSuccessfulSyncAt: new Date().toISOString(),
              newestMessageCursor: newest,
            }
          : prevSync
            ? { ...prevSync, newestMessageCursor: newest }
            : {
                lastSuccessfulSyncAt: new Date(0).toISOString(),
                newestMessageCursor: newest,
              };
      cacheChannelBundles(currentServerId, currentChannelId, {
        bundles,
        hasOlderMessages: currentHasOlderMessagesRef.current,
        syncMetadata,
      });
    };

    const applyLoadedBundles = (input: {
      bundles: MessageBundle[];
      hasOlder: boolean;
    }) => {
      currentBundlesRef.current = input.bundles;
      syncLoadedMessageWindow(input.bundles, input.hasOlder);

      if (isMounted) {
        setStoredMessages(input.bundles);
        markMessagesFresh();
        setHasCompletedInitialLoad(true);
      }

      persistCurrentChannelBundleCache("http_success");
    };

    const hydrateFromCache = (): CachedChannelBundles | null => {
      if (!currentServerId || !currentChannelId) return null;
      const cached = getCachedChannelBundles(
        currentServerId,
        currentChannelId,
      );
      if (!cached) return null;

      currentBundlesRef.current = cached.bundles;
      syncLoadedMessageWindow(
        cached.bundles,
        cached.hasOlderMessages,
      );

      if (isMounted) {
        setStoredMessages(cached.bundles);
        setHasCompletedInitialLoad(true);
      }

      return cached;
    };

    const commitBundles = (next: MessageBundle[], reason: string) => {
      void reason;
      currentBundlesRef.current = next;
      syncOldestLoadedCursor(next);
      persistCurrentChannelBundleCache("realtime");
      if (!isMounted) return;
      setStoredMessages(next);
      markMessagesFresh();
    };

    const loadLatestBundles = async (currentCount: number) => {
      const loadId = createNextMessageLoadId();
      const startedAt = Date.now();
      const limit = Math.max(Math.floor(currentCount), MESSAGE_PAGE_SIZE);
      const result = await communityBackend.listChannelMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        limit,
        beforeCreatedAt: null,
        beforeMessageId: null,
      });
      const asc = [...result.messages].reverse();
      const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
        currentServerId,
        currentChannelId,
      );
      const isElevated = await usePermissionsStore
        .getState()
        .ensureElevatedInServer(
          currentServerId,
          currentUserId,
          getCommunityDataBackend(currentServerId),
        );
      const filtered = applyVisibilityToBundles(asc, {
        communityId: currentServerId,
        channelId: currentChannelId,
        revokedUserIds,
        blockedUserIds,
        isElevatedInServer: isElevated,
      });
      return {
        loadId,
        startedAt,
        bundles: filtered,
        hasOlder: result.hasMore,
      };
    };

    const loadOlderBundles = async (current: MessageBundle[]) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
      }

      const olderLoad = tryBeginOlderMessagesLoad();
      if (!olderLoad) {
        return { kind: "skipped" as const };
      }

      const { loadId, oldestLoadedCursor } = olderLoad;
      const startedAt = Date.now();

      const result = await communityBackend.listChannelMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: oldestLoadedCursor.createdAt,
        beforeMessageId: oldestLoadedCursor.id,
      });

      if (result.messages.length === 0) {
        return {
          kind: "no_more" as const,
          loadId,
          startedAt,
          oldestLoadedCursor,
        };
      }

      const ascPage = [...result.messages].reverse();
      const existingIds = new Set(current.map((b) => b.id));
      const prepend = ascPage.filter((b) => !existingIds.has(b.id));
      const merged = [...prepend, ...current].sort(compareMessageBundlesAsc);

      const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
        currentServerId,
        currentChannelId,
      );
      const isElevated = await usePermissionsStore
        .getState()
        .ensureElevatedInServer(
          currentServerId,
          currentUserId,
          getCommunityDataBackend(currentServerId),
        );
      const filtered = applyVisibilityToBundles(merged, {
        communityId: currentServerId,
        channelId: currentChannelId,
        revokedUserIds,
        blockedUserIds,
        isElevatedInServer: isElevated,
      });

      return {
        kind: "loaded" as const,
        loadId,
        startedAt,
        oldestLoadedCursor,
        prependCount: prepend.length,
        bundles: filtered,
        hasOlder: result.hasMore,
      };
    };

    const createMessageReloadScheduler = (
      runLoad: (reasonLabel: string) => Promise<void>,
    ) => {
      let activeLoadPromise: Promise<void> | null = null;
      let scheduledReloadTimerId: ReturnType<typeof setTimeout> | null = null;
      const pendingReloadReasons = new Set<string>();

      const flushScheduledMessageReload = () => {
        if (!isMounted) return;
        if (activeLoadPromise) return;
        if (pendingReloadReasons.size === 0) return;

        const reasons = Array.from(pendingReloadReasons);
        pendingReloadReasons.clear();
        const reasonLabel = reasons.join("+");

        activeLoadPromise = runLoad(reasonLabel).finally(() => {
          activeLoadPromise = null;
          if (!isMounted) return;
          if (
            pendingReloadReasons.size > 0 &&
            scheduledReloadTimerId === null
          ) {
            scheduledReloadTimerId = setTimeout(() => {
              scheduledReloadTimerId = null;
              flushScheduledMessageReload();
            }, 40);
          }
        });
      };

      const scheduleMessageReload = (reason: string, delayMs = 60) => {
        if (!isMounted) return;
        pendingReloadReasons.add(reason);
        logReload("load:queued", {
          reason,
          delayMs,
          pendingReasons: Array.from(pendingReloadReasons),
        });

        if (scheduledReloadTimerId !== null) return;
        if (delayMs <= 0 && !activeLoadPromise) {
          flushScheduledMessageReload();
          return;
        }

        scheduledReloadTimerId = setTimeout(
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
          clearTimeout(scheduledReloadTimerId);
        }
        scheduledReloadTimerId = null;
      };

      return { scheduleMessageReload, cleanup };
    };

    const createMessageReloadLifecycle = (scheduler: {
      scheduleMessageReload: (reason: string, delayMs?: number) => void;
    }) => {
      const maintenanceBatchLimit = 100;
      const maintenanceIntervalMs = 60 * 1000;

      const runMessageMediaMaintenanceForLifecycle = async () => {
        try {
          const result = await runMessageMediaMaintenance(
            maintenanceBatchLimit,
          );
          if (!isMounted) return;
          if ((result.deletedMessages ?? 0) > 0) {
            logReload("maintenance:deleted", {
              deletedMessages: result.deletedMessages ?? 0,
              deletedObjects: result.deletedObjects ?? 0,
            });
            scheduler.scheduleMessageReload("maintenance_reload", 20);
          }
        } catch (error) {
          if (!isMounted) return;
          console.warn("Failed to run media maintenance:", error);
        }
      };

      const browserRuntime = getAppHost().browserRuntime;
      const handleVisibilityChange = () => {
        const visibility = browserRuntime?.getVisibilityState() ?? "visible";
        logReload("visibility", { state: visibility });
        if (visibility === "visible") {
          if (areMessagesFresh()) {
            logReload("load:skip_fresh", {
              reason: "visibility_resume",
              freshnessWindowMs: MESSAGE_RELOAD_FRESHNESS_WINDOW_MS,
            });
            return;
          }
          scheduler.scheduleMessageReload("visibility_resume", 120);
        }
      };

      const handleWindowFocus = () => {
        logReload("window_focus");
        if (areMessagesFresh()) {
          logReload("load:skip_fresh", {
            reason: "window_focus",
            freshnessWindowMs: MESSAGE_RELOAD_FRESHNESS_WINDOW_MS,
          });
          return;
        }
        scheduler.scheduleMessageReload("window_focus", 120);
      };

      const handleWindowBlur = () => {
        logReload("window_blur");
      };

      const start = () => {
        void runMessageMediaMaintenanceForLifecycle();
        cleanupIntervalRef.current = setInterval(() => {
          void runMessageMediaMaintenanceForLifecycle();
        }, maintenanceIntervalMs);
        unsubscribeVisibilityListenerRef.current =
          browserRuntime?.addVisibilityChangeListener(handleVisibilityChange) ??
          null;
        unsubscribeFocusListenerRef.current =
          browserRuntime?.addFocusListener(handleWindowFocus) ?? null;
        unsubscribeBlurListenerRef.current =
          browserRuntime?.addBlurListener(handleWindowBlur) ?? null;
      };

      const cleanup = () => {
        if (cleanupIntervalRef.current !== null) {
          clearInterval(cleanupIntervalRef.current);
        }
        cleanupIntervalRef.current = null;
        unsubscribeVisibilityListenerRef.current?.();
        unsubscribeFocusListenerRef.current?.();
        unsubscribeBlurListenerRef.current?.();
        unsubscribeVisibilityListenerRef.current = null;
        unsubscribeFocusListenerRef.current = null;
        unsubscribeBlurListenerRef.current = null;
      };

      return { start, cleanup };
    };

    const onLoadMessages = async (reasonLabel: string) => {
      const reasons = parseMessageReloadReasons(reasonLabel);
      const localCount = currentBundlesRef.current.length;
      const needsFull =
        messageReloadReasonsRequireFullLoad(reasons) || localCount === 0;

      if (!needsFull) {
        const loadId = createNextMessageLoadId();
        const startedAt = Date.now();
        logReload("load:soft_start", { reason: reasonLabel, loadId });
        try {
          const currentList = currentBundlesRef.current;
          const tail = computeNewestMessageBundleCursor(currentList);
          if (!tail) return;

          const page = await communityBackend.listChannelMessages({
            communityId: currentServerId,
            channelId: currentChannelId,
            limit: MESSAGE_PAGE_SIZE,
            beforeCreatedAt: null,
            beforeMessageId: null,
          });
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;

          const ascTail = [...page.messages].reverse();
          const merged = mergeBundlesById(currentList, ascTail);

          const revokedUserIds = await ensureChannelRevokedUserIdsLoaded(
            currentServerId,
            currentChannelId,
          );
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;

          const isElevated = await usePermissionsStore
            .getState()
            .ensureElevatedInServer(
              currentServerId,
              currentUserId,
              getCommunityDataBackend(currentServerId),
            );
          const filtered = applyVisibilityToBundles(merged, {
            communityId: currentServerId,
            channelId: currentChannelId,
            revokedUserIds,
            blockedUserIds,
            isElevatedInServer: isElevated,
          });

          const hasOlder = currentHasOlderMessagesRef.current;
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;
          applyLoadedBundles({ bundles: filtered, hasOlder });
          logReload("load:soft_success", {
            reason: reasonLabel,
            loadId,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          if (!isMounted) return;
          console.error("Error soft-revalidating messages:", error);
          logReload("load:soft_error", {
            reason: reasonLabel,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      let loadId: number | null = null;
      let startedAt = Date.now();
      try {
        const loaded = await loadLatestBundles(
          currentBundlesRef.current.length,
        );
        loadId = loaded.loadId;
        startedAt = loaded.startedAt;
        logReload("load:start", { reason: reasonLabel, loadId });

        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        applyLoadedBundles({
          bundles: loaded.bundles,
          hasOlder: loaded.hasOlder,
        });
        dataCacheDebug.fetch("useMessages", "load:success", {
          currentServerId,
          currentChannelId,
          messageCount: loaded.bundles.length,
          hasOlder: loaded.hasOlder,
          reason: reasonLabel,
        });
        logReload("load:success", {
          reason: reasonLabel,
          loadId,
          durationMs: Date.now() - startedAt,
          messageCount: loaded.bundles.length,
          hasOlderMessages: loaded.hasOlder,
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
          reason: reasonLabel,
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const loadOlderMessages = async () => {
      if (!isMounted) return;
      let loadResult: Awaited<ReturnType<typeof loadOlderBundles>> | null = null;
      let loadId: number | null = null;
      let startedAt = Date.now();

      try {
        loadResult = await loadOlderBundles(currentBundlesRef.current);
        if (loadResult.kind === "skipped") return;

        loadId = loadResult.loadId;
        startedAt = loadResult.startedAt;
        logReload("load-older:start", {
          loadId,
          cursorCreatedAt: loadResult.oldestLoadedCursor.createdAt,
          cursorId: loadResult.oldestLoadedCursor.id,
          currentMessageCount: currentBundlesRef.current.length,
        });

        if (loadResult.kind === "no_more") {
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;
          syncLoadedMessageWindow(currentBundlesRef.current, false);
          logReload("load-older:complete", {
            loadId,
            addedCount: 0,
            durationMs: Date.now() - startedAt,
            hasOlderMessages: false,
          });
          return;
        }

        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        applyLoadedBundles({
          bundles: loadResult.bundles,
          hasOlder: loadResult.hasOlder,
        });
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

    const messageReloadScheduler =
      createMessageReloadScheduler(onLoadMessages);
    const messageReloadLifecycle =
      createMessageReloadLifecycle(messageReloadScheduler);

    const hydrated = hydrateFromCache();
    if (hydrated) {
      dataCacheDebug.hydration("useMessages", "hydrateFromCache", {
        currentServerId,
        currentChannelId,
        messageCount: hydrated.bundles.length,
        hasOlderMessages: hydrated.hasOlderMessages,
      });
      logReload("cache:hydrate", {
        messageCount: hydrated.bundles.length,
        hasOlderMessages: hydrated.hasOlderMessages,
      });
    }
    messageReloadLifecycle.start();

    if (!hydrated) {
      dataCacheDebug.fetch("useMessages", "schedule initial load", {
        currentServerId,
        currentChannelId,
        hydrated: false,
      });
      messageReloadScheduler.scheduleMessageReload("initial", 0);
    } else if (hydrated.bundles.length === 0) {
      dataCacheDebug.fetch("useMessages", "schedule soft revalidate — empty cache hydrate", {
        currentServerId,
        currentChannelId,
      });
      messageReloadScheduler.scheduleMessageReload("soft_revalidate", 120);
    } else {
      const meta = hydrated.syncMetadata;
      const lastAt = meta ? Date.parse(meta.lastSuccessfulSyncAt) : NaN;
      const stale =
        !meta ||
        Number.isNaN(lastAt) ||
        Date.now() - lastAt >= CHANNEL_BUNDLE_STALE_MS;

      if (!stale) {
        messageReloadScheduler.scheduleMessageReload(
          "deferred_soft_revalidate",
          2500,
        );
      } else {
        messageReloadScheduler.scheduleMessageReload("soft_revalidate", 120);
      }
    }

    const handleMessagePayload = (payload: unknown) => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) {
        messageReloadScheduler.scheduleMessageReload("messages_sub_fallback");
        return;
      }
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const rowRecord = eventType === "DELETE" ? oldRow : nextRow;
      const messageId = getStringField(rowRecord, "id");
      if (!messageId) {
        messageReloadScheduler.scheduleMessageReload("messages_sub_fallback");
        return;
      }

      if (eventType === "DELETE") {
        const next = currentBundlesRef.current.filter((b) => b.id !== messageId);
        commitBundles(next, "messages_sub_delete");
        return;
      }

      const deletedAt = getNullableStringField(nextRow, "deleted_at");
      if (deletedAt) {
        const next = currentBundlesRef.current.filter((b) => b.id !== messageId);
        commitBundles(next, "messages_sub_soft_delete");
        return;
      }

      if (!nextRow || !currentServerId || !currentChannelId) return;
      const incoming = rawMessageRowToBundle(
        nextRow,
        currentServerId,
        currentChannelId,
      );
      if (!incoming) {
        messageReloadScheduler.scheduleMessageReload("messages_sub_fallback");
        return;
      }

      const list = currentBundlesRef.current;
      const idx = list.findIndex((b) => b.id === messageId);
      const base =
        idx >= 0
          ? {
              ...list[idx],
              ...incoming,
              reactions: list[idx].reactions,
              attachment: list[idx].attachment,
              linkPreview: list[idx].linkPreview,
            }
          : incoming;
      const next = [...list.filter((b) => b.id !== messageId), base].sort(
        compareMessageBundlesAsc,
      );
      const revokedUserIds = getCachedChannelRevokedUserIds(
        currentServerId,
        currentChannelId,
      ) ?? [];
      const filtered = applyVisibilityToBundles(next, {
        communityId: currentServerId,
        channelId: currentChannelId,
        revokedUserIds,
        blockedUserIds,
        isElevatedInServer: isCurrentUserElevatedInServer,
      });
      commitBundles(
        filtered,
        idx >= 0 ? "messages_sub_update" : "messages_sub_insert",
      );
    };

    const handleReactionPayload = (payload: unknown) => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) {
        messageReloadScheduler.scheduleMessageReload("reactions_sub_fallback");
        return;
      }
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);

      if (eventType === "DELETE") {
        const reactionId = getStringField(oldRow, "id");
        if (!reactionId) return;
        const messageId = getStringField(oldRow, "message_id");
        if (!messageId) return;
        updateMessageBundle(messageId, (b) => ({
          ...b,
          reactions: b.reactions.filter((r) => r.id !== reactionId),
        }));
        currentBundlesRef.current = useMessagesStore.getState().messages;
        persistCurrentChannelBundleCache("realtime");
        markMessagesFresh();
        return;
      }

      const reaction = parseReactionFromRow(nextRow);
      if (!reaction) return;
      if (!currentBundlesRef.current.some((b) => b.id === reaction.messageId))
        return;

      updateMessageBundle(reaction.messageId, (b) => {
        const without = b.reactions.filter((r) => r.id !== reaction.id);
        const merged = [...without, reaction].sort((a, c) => {
          if (a.createdAt < c.createdAt) return -1;
          if (a.createdAt > c.createdAt) return 1;
          return a.id.localeCompare(c.id);
        });
        return { ...b, reactions: merged };
      });
      currentBundlesRef.current = useMessagesStore.getState().messages;
      persistCurrentChannelBundleCache("realtime");
      markMessagesFresh();
    };

    const handleAttachmentPayload = (payload: unknown) => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) {
        messageReloadScheduler.scheduleMessageReload(
          "attachments_sub_fallback",
        );
        return;
      }
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const messageId =
        getStringField(nextRow, "message_id") ??
        getStringField(oldRow, "message_id");
      if (!messageId) {
        messageReloadScheduler.scheduleMessageReload(
          "attachments_sub_fallback",
        );
        return;
      }

      if (eventType === "DELETE") {
        updateMessageBundle(messageId, (b) => ({ ...b, attachment: null }));
        currentBundlesRef.current = useMessagesStore.getState().messages;
        persistCurrentChannelBundleCache("realtime");
        markMessagesFresh();
        return;
      }

      void (async () => {
        const att = parseAttachmentFromRow(nextRow);
        if (!att) return;
        const signed = await signRealtimeMessageAttachment(
          communityBackend,
          currentServerId,
          currentChannelId,
          att,
        );
        if (!isMounted) return;
        updateMessageBundle(messageId, (b) => ({
          ...b,
          attachment: signed,
        }));
        currentBundlesRef.current = useMessagesStore.getState().messages;
        persistCurrentChannelBundleCache("realtime");
        markMessagesFresh();
      })();
    };

    const handleLinkPreviewPayload = (payload: unknown) => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) {
        messageReloadScheduler.scheduleMessageReload("previews_sub_fallback");
        return;
      }
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const messageId =
        getStringField(nextRow, "message_id") ??
        getStringField(oldRow, "message_id");
      if (!messageId) {
        messageReloadScheduler.scheduleMessageReload("previews_sub_fallback");
        return;
      }

      if (eventType === "DELETE") {
        updateMessageBundle(messageId, (b) => ({ ...b, linkPreview: null }));
      } else {
        const lp = parseLinkPreviewFromRow(nextRow);
        if (lp) {
          updateMessageBundle(messageId, (b) => ({ ...b, linkPreview: lp }));
        }
      }
      currentBundlesRef.current = useMessagesStore.getState().messages;
      persistCurrentChannelBundleCache("realtime");
      markMessagesFresh();
    };

    dataCacheDebug.realtime("useMessages", "subscribe message streams", {
      currentServerId,
      currentChannelId,
    });

    const cleanupRealtimeMessageStreams = (() => {
      const messageChannel = communityBackend.subscribeToMessages(
        currentChannelId,
        handleMessagePayload,
      );
      const reactionsChannel = communityBackend.subscribeToMessageReactions(
        currentChannelId,
        handleReactionPayload,
      );
      const attachmentsChannel = communityBackend.subscribeToMessageAttachments(
        currentChannelId,
        handleAttachmentPayload,
      );
      const linkPreviewsChannel =
        communityBackend.subscribeToMessageLinkPreviews(
          currentChannelId,
          handleLinkPreviewPayload,
        );

      return () => {
        void messageChannel.unsubscribe();
        void reactionsChannel.unsubscribe();
        void attachmentsChannel.unsubscribe();
        void linkPreviewsChannel.unsubscribe();
      };
    })();

    return () => {
      isMounted = false;
      if (lastEffectArmKeyRef.current === effectArmKey) {
        lastEffectArmKeyRef.current = null;
      }
      clearRequestOlderMessagesLoader();
      messageReloadScheduler.cleanup();
      cleanupRealtimeMessageStreams();
      messageReloadLifecycle.cleanup();
    };
  }, [
    blockedUserIds,
    channels,
    clearRequestOlderMessagesLoader,
    createNextMessageLoadId,
    currentChannelId,
    currentServerId,
    currentUserId,
    debugChannelReloads,
    ensureChannelRevokedUserIdsLoaded,
    finishOlderMessagesLoad,
    getCachedChannelBundles,
    getCachedChannelRevokedUserIds,
    isCurrentUserElevatedInServer,
    isCurrentMessageLoad,
    markMessagesFresh,
    resetMessageState,
    setRequestOlderMessagesLoader,
    setStoredMessages,
    tryBeginOlderMessagesLoad,
    updateMessageBundle,
    runMessageMediaMaintenance,
    areMessagesFresh,
    cacheChannelBundles,
  ]);

  return {
    state: {
      hasOlderMessages,
      isLoadingOlderMessages,
      hasCompletedInitialLoad,
    },
    derived: {},
    actions: {
      resetMessageState,
      clearAuthorProfileCache,
      clearCrossSessionMessagingCaches,
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
