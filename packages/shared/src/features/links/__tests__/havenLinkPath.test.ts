import { describe, expect, it } from "vitest";
import {
  buildHavenLinkPath,
  parseHavenLink,
  type BuildableHavenLinkIntent,
} from "@shared/features/links";

describe("buildHavenLinkPath", () => {
  it("builds the in-app paths the router matches", () => {
    expect(buildHavenLinkPath({ kind: "home" })).toBe("/");
    expect(buildHavenLinkPath({ kind: "invite", code: "ABCDEF0123" })).toBe(
      "/invite/ABCDEF0123",
    );
    expect(
      buildHavenLinkPath({
        kind: "channel",
        communityId: "c1",
        channelId: "ch1",
      }),
    ).toBe("/community/c1/channel/ch1");
    expect(buildHavenLinkPath({ kind: "dm", conversationId: "d1" })).toBe(
      "/direct-messages/d1",
    );
    expect(
      buildHavenLinkPath({
        kind: "friends",
        tab: "requests",
        requestId: "fr1",
      }),
    ).toBe("/friends?tab=requests&request=fr1");
    expect(buildHavenLinkPath({ kind: "notifications" })).toBe(
      "/notifications",
    );
  });

  const intents: BuildableHavenLinkIntent[] = [
    { kind: "home" },
    { kind: "invite", code: "ABCDEF0123" },
    { kind: "community", communityId: "c1" },
    { kind: "channel", communityId: "c 1", channelId: "ch/1" },
    { kind: "dm", conversationId: "d1" },
    { kind: "friends", tab: "friends", requestId: null },
    { kind: "friends", tab: "requests", requestId: "fr1" },
    { kind: "notifications" },
    {
      kind: "auth_confirm",
      client: "web",
      params: { token_hash: "a+b/c=", type: "signup" },
    },
  ];

  it.each(intents.map((intent) => [intent.kind, intent] as const))(
    "round-trips the %s path as an app-relative link",
    (_kind, intent) => {
      expect(parseHavenLink(buildHavenLinkPath(intent))).toEqual(intent);
    },
  );
});
