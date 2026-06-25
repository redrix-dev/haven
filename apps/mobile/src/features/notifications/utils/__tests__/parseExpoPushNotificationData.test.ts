import { describe, expect, it } from "vitest";
import {
  parseExpoPushNotificationData,
  parseExpoPushUrl,
} from "../parseExpoPushNotificationData";

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
  });
});

describe("parseExpoPushUrl", () => {
  it("extracts query pairs", () => {
    expect(
      parseExpoPushUrl("/?kind=dm_message&conversationId=abc"),
    ).toMatchObject({
      kind: "dm_message",
      conversationId: "abc",
    });
  });
});
