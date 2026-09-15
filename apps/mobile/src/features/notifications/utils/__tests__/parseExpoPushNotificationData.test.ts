import { describe, expect, it } from "vitest";
import { parseExpoPushNotificationData } from "../parseExpoPushNotificationData";

describe("parseExpoPushNotificationData", () => {
  it("parses explicit dm_message fields", () => {
    expect(
      parseExpoPushNotificationData({
        kind: "dm_message",
        conversationId: "c1",
        url: "/?kind=dm_message&conversationId=c1",
      }),
    ).toEqual({ kind: "dm_message", conversationId: "c1" });
  });

  it("falls back to url query when fields omitted", () => {
    expect(
      parseExpoPushNotificationData({
        url: "/?kind=friend_request_received&friendRequestId=fr1",
      }),
    ).toEqual({ kind: "friend_request_received", friendRequestId: "fr1" });
  });

  it("reads a mention's ids from the url", () => {
    expect(
      parseExpoPushNotificationData({
        url: "/?kind=channel_mention&communityId=srv&channelId=ch",
      }),
    ).toEqual({
      kind: "channel_mention",
      communityId: "srv",
      channelId: "ch",
    });
  });

  it("fills ids missing from explicit fields from the url", () => {
    expect(
      parseExpoPushNotificationData({
        kind: "dm_message",
        url: "/?kind=dm_message&conversationId=c1",
      }),
    ).toEqual({ kind: "dm_message", conversationId: "c1" });
  });

  it("keeps an explicit DM without ids a DM, so the tap refreshes in place", () => {
    expect(
      parseExpoPushNotificationData({
        kind: "dm_message",
        url: "/?kind=dm_message",
      }),
    ).toEqual({ kind: "dm_message", conversationId: null });
  });

  it("reads a url-only DM without ids as the notifications list", () => {
    // Behavior change with the shared link model: this used to refresh in place.
    expect(parseExpoPushNotificationData({ url: "/?kind=dm_message" })).toEqual(
      { kind: "system" },
    );
  });

  it("accepts a url without its leading slash", () => {
    expect(
      parseExpoPushNotificationData({ url: "?kind=friend_request_accepted" }),
    ).toEqual({ kind: "friend_request_accepted" });
  });

  it("parses channel_mention", () => {
    expect(
      parseExpoPushNotificationData({
        kind: "channel_mention",
        communityId: "srv",
        channelId: "ch",
      }),
    ).toEqual({
      kind: "channel_mention",
      communityId: "srv",
      channelId: "ch",
    });
  });

  it("returns null for unknown kind", () => {
    expect(parseExpoPushNotificationData({ kind: "unknown" })).toBeNull();
    expect(parseExpoPushNotificationData({ url: "/?kind=unknown" })).toBeNull();
  });
});
