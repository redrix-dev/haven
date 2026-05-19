import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHavenCore } from "@shared/core";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import type {
  Channel,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { getCommunityDataBackend } from "@shared/lib/backend";

/**
 * @deprecated Thin facade over `CommunityMessageNexus`.
 *
 * Owns channel load lifecycles and action wrappers. Chat reads should use
 * `core.messages.for(communityId).useVisibleChannel(channelId)` directly.
 */

const MESSAGE_RELOAD_FRESHNESS_WINDOW_MS = 10_000;

/** @deprecated Nexus.clearAll handles this; legacy no-op. */
export function clearCrossSessionMessagingCaches(): void {}

export type PrefetchCommunityChannelMessagesInput = {
  serverId: string;
  channelId: string;
  currentUserId: string | null;
};

import { requireHavenCore } from "@shared/core";

/** Prefetch a community channel via the nexus (idempotent). */
export async function prefetchCommunityChannelMessages({
  serverId,
  channelId,
}: PrefetchCommunityChannelMessagesInput): Promise<void> {
  try {
    const core = requireHavenCore();
    await core.messages.for(serverId).loadInitial(channelId);
  } catch (err) {
    console.warn("[useMessages] prefetch failed", err);
  }
}

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
  channels: Channel[];
};

export function useMessages({
  currentServerId,
  currentChannelId,
  currentUserId,
  channels,
}: UseMessagesInput) {
  const core = useHavenCore();
  const { setRainbowMode } = useUserStatusStore();

  const messageNexus = useMemo(
    () => (currentServerId ? core.messages.for(currentServerId) : null),
    [core, currentServerId],
  );

  const meta = messageNexus?.useChannelMeta(currentChannelId ?? "__none__") ?? {
    hasMore: false,
    cursor: null,
  };

  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const lastFreshRef = useRef(0);

  useEffect(() => {
    if (!currentServerId) return;
    core.syncViewerMessagePolicy(currentServerId);
  }, [core, currentServerId]);

  // Trigger initial load when channel changes.
  useEffect(() => {
    if (!currentServerId || !currentChannelId || !messageNexus) return;

    const channel = channels.find((c) => c.id === currentChannelId);
    if (channels.length > 0) {
      if (!channel || channel.community_id !== currentServerId) return;
      if (channel.kind !== "text") return;
    }

    let cancelled = false;
    (async () => {
      try {
        await messageNexus.loadInitial(currentChannelId);
        if (!cancelled) {
          setHasCompletedInitialLoad(true);
          lastFreshRef.current = Date.now();
        }
      } catch (err) {
        console.error("Error loading messages:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageNexus, currentServerId, currentChannelId, channels]);

  useEffect(() => {
    if (!currentServerId || !currentChannelId) return;
    let cancelled = false;
    void (async () => {
      try {
        await core.permissions.loadRevokedAuthorIdsForChannel(
          currentServerId,
          currentChannelId,
          getCommunityDataBackend(currentServerId),
        );
        if (!cancelled) {
          core.syncViewerMessagePolicy(currentServerId);
        }
      } catch (err) {
        console.warn("[useMessages] revoked-user load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, currentServerId, currentChannelId]);

  const requestOlderMessages = useCallback(async () => {
    if (!messageNexus || !currentChannelId) return;
    if (!meta.hasMore) return;
    setIsLoadingOlderMessages(true);
    try {
      await messageNexus.loadOlder(currentChannelId);
    } catch (err) {
      console.error("Error loading older messages:", err);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [messageNexus, currentChannelId, meta.hasMore]);

  const sendMessage = useCallback(
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
      if (!currentUserId || !currentChannelId || !currentServerId || !messageNexus) {
        return;
      }

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
        const { id } = await messageNexus.send(currentChannelId, content, {
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
          await messageNexus.deleteMessageRpc(id);
          throw e;
        }
        return;
      }

      await messageNexus.send(currentChannelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
      });
    },
    [currentChannelId, currentServerId, currentUserId, messageNexus, setRainbowMode],
  );

  const toggleMessageReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!messageNexus || !currentChannelId) throw new Error("No channel selected.");
      await messageNexus.toggleReaction(currentChannelId, messageId, emoji);
    },
    [messageNexus, currentChannelId],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!messageNexus) throw new Error("No server selected.");
      const trimmed = content.trim();
      if (!trimmed) throw new Error("Message content is required.");
      await messageNexus.edit(messageId, trimmed);
    },
    [messageNexus],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!messageNexus) throw new Error("No server selected.");
      await messageNexus.deleteMessageRpc(messageId);
    },
    [messageNexus],
  );

  const reportMessage = useCallback(
    async (input: {
      messageId: string;
      target: MessageReportTarget;
      kind: MessageReportKind;
      comment: string;
    }) => {
      if (!messageNexus || !currentChannelId || !currentUserId) {
        throw new Error("No channel selected.");
      }
      await messageNexus.report({
        channelId: currentChannelId,
        messageId: input.messageId,
        reporterUserId: currentUserId,
        target: input.target,
        kind: input.kind,
        comment: input.comment,
      });
    },
    [messageNexus, currentChannelId, currentUserId],
  );

  const requestMessageLinkPreviewRefresh = useCallback(
    async (messageId: string) => {
      if (!currentServerId || !currentChannelId) {
        throw new Error("No channel selected.");
      }
      const selectedChannel = channels.find((c) => c.id === currentChannelId);
      if (!selectedChannel || selectedChannel.kind !== "text") {
        throw new Error("Link previews can only be refreshed in text channels.");
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

  const prefetchChannelMessages = useCallback(
    async (serverId: string, channelId: string) => {
      await core.messages.for(serverId).loadInitial(channelId);
    },
    [core],
  );

  const resetMessageState = useCallback(() => {
    setHasCompletedInitialLoad(false);
  }, []);

  const purgeMessageBundleCacheForServer = useCallback(
    (communityId: string) => core.messages.clearCommunity(communityId),
    [core],
  );

  const purgeMessageBundleCacheForChannel = useCallback(
    (communityId: string, channelId: string) => {
      core.messages.for(communityId).evictChannel(channelId);
    },
    [core],
  );

  const applyChannelAccessRevokedContentVisibility = useCallback(
    (input: { communityId: string; channelId: string; revokedUserId: string }) => {
      core.permissions.appendRevokedAuthorId(
        input.communityId,
        input.channelId,
        input.revokedUserId,
      );
    },
    [core],
  );

  const runMessageMediaMaintenance = useCallback(
    async (limit = 100) => {
      if (!currentServerId) throw new Error("No server selected.");
      const communityBackend = getCommunityDataBackend(currentServerId);
      return communityBackend.runMessageMediaMaintenance(limit);
    },
    [currentServerId],
  );

  // Stale → trigger soft revalidate via re-running loadInitial. The nexus
  // dedupe makes this safe.
  useEffect(() => {
    if (!messageNexus || !currentChannelId) return;
    if (!hasCompletedInitialLoad) return;
    const elapsed = Date.now() - lastFreshRef.current;
    if (elapsed > MESSAGE_RELOAD_FRESHNESS_WINDOW_MS) {
      void messageNexus.loadInitial(currentChannelId);
      lastFreshRef.current = Date.now();
    }
  }, [messageNexus, currentChannelId, hasCompletedInitialLoad]);

  return {
    state: {
      hasOlderMessages: meta.hasMore,
      isLoadingOlderMessages,
      hasCompletedInitialLoad,
    },
    derived: {},
    actions: {
      resetMessageState,
      clearAuthorProfileCache: () => {},
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
      runMessageMediaMaintenance,
    },
  };
}
