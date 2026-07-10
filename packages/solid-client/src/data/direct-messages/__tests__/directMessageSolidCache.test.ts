import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import { createMemoryPersistence } from "@shared/core";
import { DirectMessageSolidNexus } from "../directMessageSolidNexus";

const conversation = (
  input: Partial<DirectMessageConversationSummary> & {
    conversationId: string;
  },
): DirectMessageConversationSummary => ({
  conversationId: input.conversationId,
  kind: input.kind ?? "direct",
  otherUserId: input.otherUserId ?? "peer-1",
  otherUsername: input.otherUsername ?? "Peer",
  otherAvatarUrl: input.otherAvatarUrl ?? null,
  createdAt: input.createdAt ?? "2026-06-13T10:00:00.000Z",
  updatedAt: input.updatedAt ?? "2026-06-13T10:00:00.000Z",
  lastMessageAt: input.lastMessageAt ?? null,
  lastMessageId: input.lastMessageId ?? null,
  lastMessageAuthorUserId: input.lastMessageAuthorUserId ?? null,
  lastMessagePreview: input.lastMessagePreview ?? null,
  lastMessageCreatedAt: input.lastMessageCreatedAt ?? null,
  unreadCount: input.unreadCount ?? 0,
  isMuted: input.isMuted ?? false,
  mutedUntil: input.mutedUntil ?? null,
});

const message = (
  input: Partial<DirectMessage> & {
    conversationId: string;
    messageId: string;
    createdAt: string;
  },
): DirectMessage => ({
  messageId: input.messageId,
  conversationId: input.conversationId,
  authorUserId: input.authorUserId ?? "peer-1",
  authorUsername: input.authorUsername ?? "Peer",
  authorAvatarUrl: input.authorAvatarUrl ?? null,
  content: input.content ?? "Hello",
  metadata: input.metadata ?? {},
  createdAt: input.createdAt,
  editedAt: input.editedAt ?? null,
  deletedAt: input.deletedAt ?? null,
  attachments: input.attachments ?? [],
});

const imageAttachment = (
  input: Partial<DirectMessageAttachment> & {
    messageId: string;
    conversationId: string;
  },
): DirectMessageAttachment => ({
  id: input.id ?? "attachment-1",
  messageId: input.messageId,
  conversationId: input.conversationId,
  ownerUserId: input.ownerUserId ?? "viewer-1",
  bucketName: input.bucketName ?? "dm-message-media",
  objectPath: input.objectPath ?? "conversation-1/photo.png",
  originalFilename: input.originalFilename ?? "photo.png",
  mimeType: input.mimeType ?? "image/png",
  mediaKind: "image",
  sizeBytes: input.sizeBytes ?? 12,
  createdAt: input.createdAt ?? "2026-06-13T10:01:00.000Z",
  expiresAt: input.expiresAt ?? "2026-06-14T10:01:00.000Z",
  signedUrl: input.signedUrl ?? null,
});

function createBackend(
  overrides: Partial<DirectMessageBackend> = {},
): DirectMessageBackend {
  return {
    listConversations: vi.fn().mockResolvedValue([]),
    getOrCreateDirectConversation: vi.fn().mockResolvedValue("conversation-1"),
    listMessages: vi.fn().mockResolvedValue([]),
    getMessage: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn(),
    markConversationRead: vi.fn().mockResolvedValue(true),
    setConversationMuted: vi.fn().mockResolvedValue(true),
    reportMessage: vi.fn().mockResolvedValue("report-1"),
    ...overrides,
  };
}

describe("DirectMessageSolidNexus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps messages sorted when realtime hydration arrives out of order", async () => {
    const newer = message({
      conversationId: "conversation-1",
      messageId: "message-2",
      createdAt: "2026-06-13T10:02:00.000Z",
      content: "Second",
    });
    const older = message({
      conversationId: "conversation-1",
      messageId: "message-1",
      createdAt: "2026-06-13T10:01:00.000Z",
      content: "First",
    });
    const backend = createBackend({
      getMessage: vi
        .fn()
        .mockResolvedValueOnce(newer)
        .mockResolvedValueOnce(older),
    });
    const cache = new DirectMessageSolidNexus(
      createMemoryPersistence(),
      backend,
    );
    cache.setConversations([
      conversation({ conversationId: "conversation-1" }),
    ]);

    await cache.receiveMessage("conversation-1", "message-2");
    await cache.receiveMessage("conversation-1", "message-1");

    expect(cache.state.messagesByConversation["conversation-1"]).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(cache.state.entities["conversation-1"]?.data.lastMessageId).toBe(
      "message-2",
    );
    expect(cache.state.entities["conversation-1"]?.data.unreadCount).toBe(1);
    expect(backend.markConversationRead).not.toHaveBeenCalled();
  });

  it("marks active incoming direct messages read after realtime hydration", async () => {
    const incoming = message({
      conversationId: "conversation-1",
      messageId: "message-1",
      createdAt: "2026-06-13T10:01:00.000Z",
      authorUserId: "peer-1",
    });
    const backend = createBackend({
      getMessage: vi.fn().mockResolvedValue(incoming),
    });
    const cache = new DirectMessageSolidNexus(
      createMemoryPersistence(),
      backend,
    );
    cache.setConversations([
      conversation({ conversationId: "conversation-1", otherUserId: "peer-1" }),
    ]);
    cache.setActiveConversationId("conversation-1");

    await cache.receiveMessage("conversation-1", "message-1");
    await vi.runAllTimersAsync();

    expect(backend.markConversationRead).toHaveBeenCalledWith("conversation-1");
    expect(cache.state.entities["conversation-1"]?.data.unreadCount).toBe(0);
  });

  it("preserves a newer local latest message when a stale conversation load resolves", async () => {
    const staleSummary = conversation({
      conversationId: "conversation-1",
      lastMessageId: "message-old",
      lastMessageAt: "2026-06-13T10:00:00.000Z",
      lastMessageCreatedAt: "2026-06-13T10:00:00.000Z",
      lastMessagePreview: "Old",
    });
    let resolveConversations:
      | ((value: DirectMessageConversationSummary[]) => void)
      | null = null;
    const backend = createBackend({
      listConversations: vi.fn(
        () =>
          new Promise<DirectMessageConversationSummary[]>((resolve) => {
            resolveConversations = resolve;
          }),
      ),
    });
    const cache = new DirectMessageSolidNexus(
      createMemoryPersistence(),
      backend,
    );
    cache.setConversations([staleSummary]);

    const load = cache.loadConversations();
    await Promise.resolve();

    cache.upsertMessage(
      message({
        conversationId: "conversation-1",
        messageId: "message-new",
        createdAt: "2026-06-13T10:03:00.000Z",
        content: "Fresh realtime",
      }),
    );
    cache.updateConversation("conversation-1", {
      updatedAt: "2026-06-13T10:03:00.000Z",
      lastMessageAt: "2026-06-13T10:03:00.000Z",
      lastMessageId: "message-new",
      lastMessageAuthorUserId: "peer-1",
      lastMessagePreview: "Fresh realtime",
      lastMessageCreatedAt: "2026-06-13T10:03:00.000Z",
      unreadCount: 1,
    });

    resolveConversations?.([staleSummary]);
    await load;

    const summary = cache.state.entities["conversation-1"]?.data;
    expect(summary?.lastMessageId).toBe("message-new");
    expect(summary?.lastMessagePreview).toBe("Fresh realtime");
    expect(summary?.unreadCount).toBe(1);
  });

  it("keeps an optimistic image URL on sent direct message attachments", async () => {
    const sent = message({
      conversationId: "conversation-1",
      messageId: "message-image",
      createdAt: "2026-06-13T10:01:00.000Z",
      authorUserId: "viewer-1",
      content: "",
      attachments: [
        imageAttachment({
          messageId: "message-image",
          conversationId: "conversation-1",
          signedUrl: null,
        }),
      ],
    });
    const sendMessage = vi.fn().mockResolvedValue(sent);
    const backend = createBackend({ sendMessage });
    const cache = new DirectMessageSolidNexus(
      createMemoryPersistence(),
      backend,
    );
    cache.setConversations([
      conversation({ conversationId: "conversation-1" }),
    ]);

    const imageBody = new Blob(["image"], { type: "image/png" });
    const display = await cache.sendMessage("conversation-1", "", {
      imageUpload: { body: imageBody, filename: "photo.png" },
      optimisticAttachmentUri: "blob:preview",
    });

    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      content: "",
      metadata: undefined,
      imageUpload: { body: imageBody, filename: "photo.png" },
    });
    expect(display.attachments[0]?.signedUrl).toBe("blob:preview");
    expect(
      cache.state.messageEntities["message-image"]?.attachments[0]?.signedUrl,
    ).toBe("blob:preview");
    expect(cache.state.entities["conversation-1"]?.data.lastMessageId).toBe(
      "message-image",
    );
  });

  it("forwards direct message reports to the backend", async () => {
    const reportMessage = vi.fn().mockResolvedValue("report-1");
    const backend = createBackend({ reportMessage });
    const cache = new DirectMessageSolidNexus(
      createMemoryPersistence(),
      backend,
    );

    const reportId = await cache.reportMessage({
      messageId: "message-1",
      kind: "content_abuse",
      comment: "Harassment in DM",
    });

    expect(reportId).toBe("report-1");
    expect(reportMessage).toHaveBeenCalledWith({
      messageId: "message-1",
      kind: "content_abuse",
      comment: "Harassment in DM",
    });
  });
});
