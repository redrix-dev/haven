/**
 * Edit and delete roll back to the real original on the Solid binding.
 *
 * Tier-2 because the Solid port's get() returns the live store proxy and
 * set() reconciles in place: a reference read before an optimistic write
 * changes with it. The plain port in the shared nexus tests can't show that,
 * and the node suite's solid-js/store is the SSR build.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import type { MessageBundle } from "@shared/lib/backend/types";
import { createSolidViewerMessagePolicyStore } from "../../session/viewerMessagePolicySessionStore";
import { CommunityMessageSolidNexus } from "../communityMessageSolidNexus";

const bundle = (id: string, second: number): MessageBundle => ({
  id,
  channelId: "c1",
  authorUserId: "u1",
  displayName: "alice",
  avatarSnapshotUrl: null,
  content: `body ${id}`,
  metadata: {},
  replyToMessageId: null,
  createdAt: new Date(Date.UTC(2026, 0, 1) + second * 1000).toISOString(),
  editedAt: null,
  deletedAt: null,
  isHidden: false,
  isPlatformStaff: false,
  reactions: [
    { id: "r1", messageId: id, userId: "u2", emoji: "👍", createdAt: "x" },
  ],
  attachment: null,
  linkPreview: null,
});

function solidNexus(backend: Record<string, unknown>) {
  const nexus = new CommunityMessageSolidNexus(
    "s1",
    createMemoryPersistence(),
    createSolidViewerMessagePolicyStore(),
  );
  nexus.setCommunityData(backend as never);
  nexus.insertMessage(bundle("m1", 1));
  nexus.insertMessage(bundle("m2", 2));
  return nexus;
}

const refuse = vi.fn(async () => {
  throw new Error("refused");
});

describe("CommunityMessageSolidNexus edit/delete rollback (Solid store)", () => {
  it("a refused edit restores the original text, and the same edit can be retried", async () => {
    const editUserMessage = vi.fn(async () => {
      throw new Error("refused");
    });
    const nexus = solidNexus({ editUserMessage });

    await expect(nexus.edit("m1", "changed")).rejects.toThrow("refused");
    expect(nexus.getSnapshot("m1")).toMatchObject({
      content: "body m1",
      editedAt: null,
    });

    // Not short-circuited as "unchanged": the retry reaches the backend.
    await expect(nexus.edit("m1", "changed")).rejects.toThrow("refused");
    expect(editUserMessage).toHaveBeenCalledTimes(2);
  });

  it("a refused delete restores the message whole, in its place", async () => {
    const nexus = solidNexus({ deleteMessage: refuse });

    await expect(nexus.deleteMessage("m1")).rejects.toThrow("refused");

    expect(nexus.getSnapshot("m1")).toMatchObject({
      content: "body m1",
      reactions: [{ emoji: "👍" }],
    });
    expect(
      nexus
        .visibleChannelMessages(() => "c1")()
        .map((m) => m.id),
    ).toEqual(["m1", "m2"]);
  });
});
