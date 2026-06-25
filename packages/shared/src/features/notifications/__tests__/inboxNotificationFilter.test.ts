import { describe, expect, it } from "vitest";
import {
  countFilteredUnreadInInbox,
  filterNotificationsForInbox,
  isNotificationInboxRow,
} from "@shared/features/notifications/inboxNotificationFilter";
import type { NotificationItem } from "@shared/lib/backend/types";

const base = (overrides: Partial<NotificationItem>): NotificationItem =>
  ({
    recipientId: "r1",
    eventId: "e1",
    kind: "channel_mention",
    sourceKind: "message",
    sourceId: "s1",
    actorUserId: null,
    actorUsername: null,
    actorAvatarUrl: null,
    payload: {},
    deliverInApp: true,
    deliverSound: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    seenAt: null,
    readAt: null,
    dismissedAt: null,
    ...overrides,
  }) as NotificationItem;

describe("inboxNotificationFilter", () => {
  it("excludes dm_message and friend request kinds", () => {
    expect(isNotificationInboxRow(base({ kind: "channel_mention" }))).toBe(
      true,
    );
    expect(isNotificationInboxRow(base({ kind: "system" }))).toBe(true);
    expect(isNotificationInboxRow(base({ kind: "dm_message" }))).toBe(false);
    expect(
      isNotificationInboxRow(base({ kind: "friend_request_received" })),
    ).toBe(false);
    expect(
      isNotificationInboxRow(base({ kind: "friend_request_accepted" })),
    ).toBe(false);
  });

  it("excludes dismissed rows", () => {
    expect(
      isNotificationInboxRow(
        base({
          kind: "channel_mention",
          dismissedAt: "2026-01-02T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("filterNotificationsForInbox keeps only visible rows", () => {
    const list = [
      base({ kind: "channel_mention", recipientId: "a" }),
      base({ kind: "dm_message", recipientId: "b" }),
      base({ kind: "friend_request_received", recipientId: "c" }),
    ];
    expect(filterNotificationsForInbox(list).map((n) => n.recipientId)).toEqual(
      ["a"],
    );
  });

  it("countFilteredUnreadInInbox ignores excluded kinds and counts unread only", () => {
    const list = [
      base({ kind: "channel_mention", recipientId: "u1", readAt: null }),
      base({
        kind: "channel_mention",
        recipientId: "u2",
        readAt: "2026-01-01T00:00:00.000Z",
      }),
      base({
        kind: "friend_request_received",
        recipientId: "fr",
        readAt: null,
      }),
      base({ kind: "dm_message", recipientId: "dm", readAt: null }),
    ];
    expect(countFilteredUnreadInInbox(list)).toBe(1);
  });
});
