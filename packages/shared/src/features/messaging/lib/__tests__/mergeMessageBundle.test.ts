import { describe, expect, it } from "vitest";
import {
  computeNewestMessageCursor,
  mergeMessagesById,
  mergeReactionsById,
  messageReloadReasonsRequireFullLoad,
  parseMessageReloadReasons,
} from "@shared/features/messaging/lib/mergeMessageBundle";
import type { Message, MessageReaction } from "@shared/lib/backend/types";

const makeMessage = (id: string, createdAt: string): Message =>
  ({
    id,
    community_id: "s",
    channel_id: "c",
    author_user_id: "u1",
    content: "x",
    created_at: createdAt,
    metadata: null,
    is_hidden: false,
  }) as Message;

describe("mergeMessageBundle", () => {
  it("mergeMessagesById dedupes by id and sorts ascending", () => {
    const a = makeMessage("1", "2026-01-01T00:00:00.000Z");
    const b = makeMessage("2", "2026-01-02T00:00:00.000Z");
    const b2 = makeMessage("2", "2026-01-02T12:00:00.000Z");
    const merged = mergeMessagesById([b, a], [b2]);
    expect(merged.map((m) => m.id)).toEqual(["1", "2"]);
    expect(merged[1].created_at).toBe("2026-01-02T12:00:00.000Z");
  });

  it("computeNewestMessageCursor returns tail", () => {
    const m = [
      makeMessage("1", "2026-01-01T00:00:00.000Z"),
      makeMessage("2", "2026-01-02T00:00:00.000Z"),
    ];
    expect(computeNewestMessageCursor(m)).toEqual({
      createdAt: "2026-01-02T00:00:00.000Z",
      id: "2",
    });
    expect(computeNewestMessageCursor([])).toBeNull();
  });

  it("mergeReactionsById merges by reaction id", () => {
    const r1: MessageReaction = {
      id: "r1",
      messageId: "m1",
      userId: "u",
      emoji: "a",
      createdAt: "t",
    };
    const r1b: MessageReaction = { ...r1, emoji: "b" };
    const merged = mergeReactionsById([r1], [r1b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].emoji).toBe("b");
  });

  it("parseMessageReloadReasons splits on +", () => {
    expect(parseMessageReloadReasons("a+b")).toEqual(["a", "b"]);
  });

  it("messageReloadReasonsRequireFullLoad detects fallback reasons", () => {
    expect(messageReloadReasonsRequireFullLoad(["soft_revalidate"])).toBe(false);
    expect(
      messageReloadReasonsRequireFullLoad(["soft_revalidate", "initial"]),
    ).toBe(true);
    expect(messageReloadReasonsRequireFullLoad(["messages_sub_fallback"])).toBe(
      true,
    );
  });
});
