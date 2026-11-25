/**
 * A push tap goes where the same notification's inbox row goes: the data the
 * database puts on a push (`worker_push_delivery`) runs through the shared
 * `notificationIntent`.
 */
import { describe, expect, it } from "vitest";
import { pushTap } from "../pushIntent";

describe("pushTap", () => {
  it("opens the conversation for a direct message", () => {
    expect(
      pushTap({
        notification_id: "n1",
        kind: "direct_message",
        channel_id: "c1",
      }),
    ).toEqual({
      intent: { kind: "dm", conversationId: "c1" },
      notificationId: "n1",
    });
  });

  it("opens the channel for a mention", () => {
    expect(
      pushTap({ kind: "mention", community_id: "s1", channel_id: "ch1" })
        ?.intent,
    ).toEqual({ kind: "channel", communityId: "s1", channelId: "ch1" });
  });

  it("opens friends on the right tab", () => {
    expect(pushTap({ kind: "friend_request" })?.intent).toEqual({
      kind: "friends",
      tab: "requests",
      requestId: null,
    });
    expect(pushTap({ kind: "friend_accepted" })?.intent).toEqual({
      kind: "friends",
      tab: "friends",
      requestId: null,
    });
  });

  it("opens the inbox for reports and notices", () => {
    expect(pushTap({ kind: "report_outcome" })?.intent).toEqual({
      kind: "notifications",
    });
  });

  it("ignores data that is not a Haven notification", () => {
    expect(pushTap(null)).toBeNull();
    expect(pushTap(["kind"])).toBeNull();
    expect(pushTap({})).toBeNull();
    expect(pushTap({ kind: "something_new" })).toBeNull();
  });
});
