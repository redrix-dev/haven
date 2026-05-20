import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { DirectMessageArea } from "@web-client/components/direct-messages/DirectMessageArea";
import { DirectMessagesSidebar } from "@web-client/components/direct-messages/DirectMessagesSidebar";
import { getErrorMessage } from "@platform/lib/errors";
import { useChatAppSession } from "@web-client/chat-app/ChatAppSession";
import { useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type { DirectMessageReportKind } from "@shared/lib/backend/types";

type ChatAppDmWorkspaceProps = {
  user: User;
};

export function ChatAppDmWorkspace({ user }: ChatAppDmWorkspaceProps) {
  const app = useChatAppSession();
  const core = useHavenCore();
  const dmNexus = core.directMessages;
  const dmWorkspaceIsActive = useUiStore((state) => state.workspaceMode === "dm");

  const dmConversations = dmNexus.useConversations();
  const dmConversationsLoading = dmNexus.useIsLoadingConversations();
  const selectedDmConversationId = dmNexus.useActiveConversationId();
  const messageConversationKey =
    dmWorkspaceIsActive && selectedDmConversationId ? selectedDmConversationId : "";
  const dmMessages = dmNexus.useMessages(messageConversationKey);
  const dmMessagesLoading = dmNexus.useIsLoadingMessages(messageConversationKey);

  const [dmConversationsRefreshing, setDmConversationsRefreshing] = useState(false);
  const [dmConversationsError, setDmConversationsError] = useState<string | null>(null);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = useState(false);
  const [dmMessagesError, setDmMessagesError] = useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = useState(false);

  useEffect(() => {
    if (!dmWorkspaceIsActive || !selectedDmConversationId) return;
    void core
      .prepareDirectMessageConversation(selectedDmConversationId, { markRead: false })
      .catch((error) => {
        console.error("Failed to load selected DM conversation:", error);
      });
  }, [core, dmWorkspaceIsActive, selectedDmConversationId]);

  useEffect(() => {
    if (!dmWorkspaceIsActive || !selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (conversation) => conversation.conversationId === selectedDmConversationId,
    );
    if (!stillExists) dmNexus.setActiveConversationId(null);
  }, [dmConversations, dmNexus, dmWorkspaceIsActive, selectedDmConversationId]);

  const refreshDmConversations = useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      if (options?.suppressLoadingState) setDmConversationsRefreshing(true);
      setDmConversationsError(null);
      try {
        await dmNexus.loadConversations();
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, "Failed to load direct messages."));
      } finally {
        setDmConversationsRefreshing(false);
      }
    },
    [dmNexus],
  );

  const refreshDmMessages = useCallback(
    async (
      conversationId: string,
      options?: { suppressLoadingState?: boolean; markRead?: boolean },
    ) => {
      if (!conversationId) return;
      if (options?.suppressLoadingState) setDmMessagesRefreshing(true);
      setDmMessagesError(null);
      try {
        await core.prepareDirectMessageConversation(conversationId, {
          markRead: options?.markRead,
        });
      } catch (error) {
        setDmMessagesError(getErrorMessage(error, "Failed to load direct messages."));
      } finally {
        setDmMessagesRefreshing(false);
      }
    },
    [core],
  );

  const openDirectMessageConversation = useCallback(
    async (conversationId: string) => {
      setDmMessagesError(null);
      await dmNexus.openConversation(conversationId, { markRead: true });
    },
    [dmNexus],
  );

  const sendDirectMessage = useCallback(
    async (
      content: string,
      options?: {
        imageBody?: Blob;
        imageArrayBuffer?: ArrayBuffer;
        imageContentType?: string;
        imageFilename?: string;
        imageExpiresInHours?: number;
      },
    ) => {
      if (!selectedDmConversationId) {
        throw new Error("No direct message conversation selected.");
      }
      setDmMessageSendPending(true);
      setDmMessagesError(null);
      try {
        const hasBlob = options?.imageBody != null;
        const hasBuffer = options?.imageArrayBuffer != null;
        if (hasBlob && hasBuffer) {
          throw new Error("Cannot send both imageBody and imageArrayBuffer.");
        }
        if (hasBuffer && !options.imageContentType?.trim()) {
          throw new Error("imageContentType is required when sending imageArrayBuffer.");
        }
        const inferredFilename =
          options?.imageFilename ??
          (options?.imageBody && "name" in options.imageBody
            ? String(options.imageBody.name)
            : undefined) ??
          `upload-${Date.now()}`;

        await dmNexus.sendMessage(selectedDmConversationId, content, {
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
        const message = getErrorMessage(error, "Failed to send direct message.");
        setDmMessagesError(message);
        throw new Error(message);
      } finally {
        setDmMessageSendPending(false);
      }
    },
    [dmNexus, selectedDmConversationId],
  );

  const toggleSelectedDmConversationMuted = useCallback(
    async (nextMuted: boolean) => {
      if (!selectedDmConversationId) {
        throw new Error("No direct message conversation selected.");
      }
      await dmNexus.setMuted(selectedDmConversationId, nextMuted);
      await refreshDmConversations({ suppressLoadingState: true });
    },
    [dmNexus, refreshDmConversations, selectedDmConversationId],
  );

  const reportDirectMessage = useCallback(
    async (input: {
      messageId: string;
      kind: DirectMessageReportKind;
      comment: string;
    }) => {
      await core.backends.directMessages.reportMessage(input);
    },
    [core.backends.directMessages],
  );

  const selectedDmConversation = useMemo(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ??
          null)
        : null,
    [dmConversations, selectedDmConversationId],
  );

  const blockedUserIds = core.social.useBlockedUserIds();
  const isSelectedDmConversationBlocked = Boolean(
    selectedDmConversation?.otherUserId &&
      blockedUserIds.has(selectedDmConversation.otherUserId),
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <DirectMessagesSidebar
        currentUserDisplayName={app.userDisplayName}
        refreshing={dmConversationsRefreshing}
        error={dmConversationsError}
        onSelectConversation={(conversationId) => {
          void openDirectMessageConversation(conversationId).catch((error: unknown) => {
            toast.error(getErrorMessage(error, "Failed to open direct message."));
          });
        }}
        onRefresh={() => {
          void refreshDmConversations({ suppressLoadingState: true });
        }}
      />
      <DirectMessageArea
        conversation={selectedDmConversation}
        currentUserId={user.id}
        currentUserDisplayName={app.userDisplayName}
        messages={dmMessages}
        loading={dmMessagesLoading}
        sending={dmMessageSendPending}
        refreshing={dmMessagesRefreshing}
        error={dmMessagesError}
        messagingUnavailable={isSelectedDmConversationBlocked}
        onRefresh={() => {
          if (!selectedDmConversationId) return;
          void refreshDmMessages(selectedDmConversationId, {
            suppressLoadingState: true,
            markRead: true,
          });
        }}
        onSendMessage={sendDirectMessage}
        onToggleMute={toggleSelectedDmConversationMuted}
        onBlockUser={app.blockDirectMessageUser}
        onReportMessage={reportDirectMessage}
        enableRichComposer={app.richComposerEnabled}
      />
    </div>
  );
}
