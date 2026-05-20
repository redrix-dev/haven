import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type { DirectMessageReportKind } from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

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

export type MobileDirectMessagesSession = {
  state: {
    dmConversations: ReturnType<
      ReturnType<typeof useHavenCore>["directMessages"]["useConversations"]
    >;
    dmConversationsLoading: boolean;
    dmConversationsRefreshing: boolean;
    dmConversationsError: string | null;
    selectedDmConversationId: string | null;
    dmMessages: ReturnType<
      ReturnType<typeof useHavenCore>["directMessages"]["useMessages"]
    >;
    dmMessagesLoading: boolean;
    dmMessagesRefreshing: boolean;
    dmMessagesError: string | null;
    dmMessageSendPending: boolean;
    dmComposeDraftPeer: ReturnType<
      ReturnType<typeof useHavenCore>["directMessages"]["useComposeDraftPeer"]
    >;
  };
  derived: {
    showDmWorkspace: boolean;
    selectedDmConversation: ReturnType<
      ReturnType<typeof useHavenCore>["directMessages"]["useConversations"]
    >[number] | null;
  };
  actions: {
    resetDirectMessages: () => void;
    clearSelectedDmConversation: () => void;
    refreshDmConversations: (options?: RefreshDmConversationsOptions) => Promise<void>;
    refreshDmMessages: (
      conversationId: string,
      options?: RefreshDmMessagesOptions,
    ) => Promise<void>;
    setSelectedDmConversationId: (value: SetStateAction<string | null>) => void;
    setDmConversationsError: (value: string | null) => void;
    setDmMessagesError: (value: string | null) => void;
    openDirectMessageConversation: (conversationId: string) => Promise<void>;
    openDirectMessageDraftWithUser: (
      targetUserId: string,
      displayName?: string | null,
    ) => void;
    openDirectMessageWithUser: (targetUserId: string) => Promise<void>;
    sendDirectMessage: (content: string, options?: SendDirectMessageOptions) => Promise<void>;
    toggleSelectedDmConversationMuted: (nextMuted: boolean) => Promise<void>;
    reportDirectMessage: (input: {
      messageId: string;
      kind: DirectMessageReportKind;
      comment: string;
    }) => Promise<void>;
    clearDirectMessageDraft: () => void;
  };
};

const MobileDirectMessagesContext = createContext<MobileDirectMessagesSession | null>(
  null,
);

export function MobileDirectMessagesProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const core = useHavenCore();
  const dm = core.directMessages;
  const workspaceMode = useUiStore((s) => s.workspaceMode);
  const isActive = workspaceMode === "dm";

  const dmConversations = dm.useConversations();
  const dmConversationsLoading = dm.useIsLoadingConversations();
  const selectedDmConversationId = dm.useActiveConversationId();
  const dmComposeDraftPeer = dm.useComposeDraftPeer();
  const messageConversationKey =
    isActive && selectedDmConversationId ? selectedDmConversationId : "";
  const dmMessages = dm.useMessages(messageConversationKey);
  const dmMessagesLoading = dm.useIsLoadingMessages(messageConversationKey);

  const [dmConversationsRefreshing, setDmConversationsRefreshing] = useState(false);
  const [dmConversationsError, setDmConversationsError] = useState<string | null>(null);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = useState(false);
  const [dmMessagesError, setDmMessagesError] = useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = useState(false);

  const setSelectedDmConversationId = useCallback(
    (value: SetStateAction<string | null>) => {
      const next =
        typeof value === "function"
          ? (value as (previousState: string | null) => string | null)(
              selectedDmConversationId,
            )
          : value;
      dm.setActiveConversationId(next);
    },
    [dm, selectedDmConversationId],
  );

  const refreshDmConversations = useCallback(
    async (options?: RefreshDmConversationsOptions) => {
      if (!userId) return;
      if (options?.suppressLoadingState) setDmConversationsRefreshing(true);
      setDmConversationsError(null);
      try {
        await dm.loadConversations();
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, "Failed to load direct messages."));
      } finally {
        setDmConversationsRefreshing(false);
      }
    },
    [dm, userId],
  );

  const refreshDmMessages = useCallback(
    async (conversationId: string, options?: RefreshDmMessagesOptions) => {
      if (!userId || !conversationId) return;
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
    [core, userId],
  );

  useEffect(() => {
    if (!userId) {
      dm.clearFocusedConversation();
    }
  }, [dm, userId]);

  useEffect(() => {
    if (!isActive || !selectedDmConversationId || !userId) return;
    void core
      .prepareDirectMessageConversation(selectedDmConversationId, { markRead: false })
      .catch((error) => {
        console.error("Failed to load selected DM conversation:", error);
      });
  }, [core, isActive, selectedDmConversationId, userId]);

  useEffect(() => {
    if (!isActive || !selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (conversation) => conversation.conversationId === selectedDmConversationId,
    );
    if (!stillExists) dm.setActiveConversationId(null);
  }, [dm, dmConversations, isActive, selectedDmConversationId]);

  const openDirectMessageConversation = useCallback(
    async (conversationId: string) => {
      if (!userId) throw new Error("Not authenticated.");
      if (!conversationId) throw new Error("DM conversation id is required.");
      setDmMessagesError(null);
      try {
        await dm.openConversation(conversationId, { markRead: true });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load direct messages.");
        setDmMessagesError(message);
        throw new Error(message);
      }
    },
    [dm, userId],
  );

  const openDirectMessageDraftWithUser = useCallback(
    (targetUserId: string, displayName?: string | null) => {
      if (!userId) throw new Error("Not authenticated.");
      dm.openDraftWithUser(targetUserId, displayName);
    },
    [dm, userId],
  );

  const openDirectMessageWithUser = useCallback(
    async (targetUserId: string) => {
      if (!userId) throw new Error("Not authenticated.");
      await dm.openWithUser(targetUserId);
    },
    [dm, userId],
  );

  const sendDirectMessage = useCallback(
    async (content: string, options?: SendDirectMessageOptions) => {
      let activeConversationId = selectedDmConversationId;
      const draftPeer = dmComposeDraftPeer;
      if (!activeConversationId && draftPeer) {
        activeConversationId = await dm.getOrCreateDirectConversation(draftPeer.userId);
        dm.setComposeDraftPeer(null);
        dm.setActiveConversationId(activeConversationId);
        await refreshDmConversations({ suppressLoadingState: true });
      }
      if (!activeConversationId) throw new Error("No direct message conversation selected.");

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
        const message = getErrorMessage(error, "Failed to send direct message.");
        setDmMessagesError(message);
        throw new Error(message);
      } finally {
        setDmMessageSendPending(false);
      }
    },
    [dm, dmComposeDraftPeer, refreshDmConversations, selectedDmConversationId],
  );

  const selectedDmConversation = useMemo(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ??
          null)
        : null,
    [dmConversations, selectedDmConversationId],
  );

  const resetDirectMessages = useCallback(() => {
    dm.clearFocusedConversation();
    setDmConversationsRefreshing(false);
    setDmConversationsError(null);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
    setDmMessageSendPending(false);
  }, [dm]);

  const value = useMemo<MobileDirectMessagesSession>(
    () => ({
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
          dm.clearFocusedConversation();
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
            throw new Error("No direct message conversation selected.");
          }
          await dm.setMuted(selectedDmConversationId, nextMuted);
          await refreshDmConversations({ suppressLoadingState: true });
        },
        reportDirectMessage: async (input) => {
          await core.backends.directMessages.reportMessage(input);
        },
        clearDirectMessageDraft: () => {
          dm.setComposeDraftPeer(null);
          setDmMessagesError(null);
        },
      },
    }),
    [
      core.backends.directMessages,
      dm,
      dmComposeDraftPeer,
      dmConversations,
      dmConversationsError,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmMessageSendPending,
      dmMessages,
      dmMessagesError,
      dmMessagesLoading,
      dmMessagesRefreshing,
      isActive,
      openDirectMessageConversation,
      openDirectMessageDraftWithUser,
      openDirectMessageWithUser,
      refreshDmConversations,
      refreshDmMessages,
      resetDirectMessages,
      selectedDmConversation,
      selectedDmConversationId,
      sendDirectMessage,
      setSelectedDmConversationId,
    ],
  );

  return (
    <MobileDirectMessagesContext.Provider value={value}>
      {children}
    </MobileDirectMessagesContext.Provider>
  );
}

export function useMobileDirectMessages(): MobileDirectMessagesSession {
  const ctx = useContext(MobileDirectMessagesContext);
  if (!ctx) {
    throw new Error("useMobileDirectMessages requires MobileDirectMessagesProvider.");
  }
  return ctx;
}
