import { describe, expect, it } from "vitest";
import {
  buildHavenLink,
  buildHavenSchemeLink,
  HAVEN_APP_ORIGIN,
  parseHavenLink,
  type BuildableHavenLinkIntent,
} from "@shared/features/links";

const kindOf = (input: string, appOrigins?: string[]) =>
  parseHavenLink(input, { appOrigins }).kind;

describe("parseHavenLink — haven:// scheme", () => {
  // Every shape probed against the old deepLinkToPath + router matcher on 2026-09-15.
  it.each([
    "haven://invite/abcdef0123",
    "haven://invite/abcdef0123/",
    "HAVEN://invite/abcdef0123",
    "Haven://Invite/abcdef0123",
    "haven:///invite/abcdef0123",
    "haven:invite/abcdef0123",
    "haven://invite/abcdef0123?ref=email",
    "haven://invite?code=abcdef0123",
  ])("reads an invite from %s", (input) => {
    expect(parseHavenLink(input)).toEqual({
      kind: "invite",
      code: "ABCDEF0123",
    });
  });

  it("reads channel, community and DM destinations", () => {
    expect(parseHavenLink("haven://community/c1/channel/ch1/")).toEqual({
      kind: "channel",
      communityId: "c1",
      channelId: "ch1",
    });
    expect(parseHavenLink("haven://community/c1")).toEqual({
      kind: "community",
      communityId: "c1",
    });
    expect(parseHavenLink("haven://direct-messages/d%31#msg-9")).toEqual({
      kind: "dm",
      conversationId: "d1",
    });
  });

  it("treats a bare scheme as home", () => {
    expect(parseHavenLink("haven://")).toEqual({ kind: "home" });
  });

  it("reads a legacy desktop auth confirm link with hash tokens", () => {
    expect(
      parseHavenLink(
        "haven://auth/confirm#access_token=abc&refresh_token=def&type=recovery",
      ),
    ).toEqual({
      kind: "auth_confirm",
      client: null,
      params: { access_token: "abc", refresh_token: "def", type: "recovery" },
    });
  });

  it.each([
    "haven://nope/not/a/route",
    "haven://community/c1/roles",
    "haven://invite/a/b",
    "haven://auth/confirm/android",
  ])("rejects %s as unsupported", (input) => {
    expect(parseHavenLink(input)).toEqual({ kind: "unsupported", input });
  });
});

describe("parseHavenLink — https on the app domain", () => {
  it("reads every canonical destination", () => {
    const base = HAVEN_APP_ORIGIN;
    expect(parseHavenLink(`${base}/invite/abcdef0123`)).toEqual({
      kind: "invite",
      code: "ABCDEF0123",
    });
    expect(parseHavenLink(`${base}/community/c1/channel/ch1`)).toEqual({
      kind: "channel",
      communityId: "c1",
      channelId: "ch1",
    });
    expect(parseHavenLink(`${base}/direct-messages/d1`)).toEqual({
      kind: "dm",
      conversationId: "d1",
    });
    expect(parseHavenLink(`${base}/friends?tab=requests&request=fr1`)).toEqual({
      kind: "friends",
      tab: "requests",
      requestId: "fr1",
    });
    expect(parseHavenLink(`${base}/friends?request=fr1`)).toEqual({
      kind: "friends",
      tab: "friends",
      requestId: null,
    });
    expect(parseHavenLink(`${base}/notifications`)).toEqual({
      kind: "notifications",
    });
    expect(parseHavenLink(`${base}/`)).toEqual({ kind: "home" });
    expect(parseHavenLink(base)).toEqual({ kind: "home" });
  });

  it("matches the host case-insensitively", () => {
    expect(kindOf("HTTPS://Haven.Redrixx.com/notifications")).toBe(
      "notifications",
    );
  });

  it.each(["web", "desktop", "ios"] as const)(
    "reads /auth/confirm/%s with the client named",
    (client) => {
      expect(
        parseHavenLink(
          `${HAVEN_APP_ORIGIN}/auth/confirm/${client}?token_hash=th&type=signup`,
        ),
      ).toEqual({
        kind: "auth_confirm",
        client,
        params: { token_hash: "th", type: "signup" },
      });
    },
  );

  it("merges query then hash params, first value wins", () => {
    const intent = parseHavenLink(
      `${HAVEN_APP_ORIGIN}/auth/confirm?type=recovery#access_token=abc&type=signup`,
    );
    expect(intent).toEqual({
      kind: "auth_confirm",
      client: null,
      params: { type: "recovery", access_token: "abc" },
    });
  });

  it("accepts a #? hash and decodes + as a space", () => {
    expect(
      parseHavenLink(
        `${HAVEN_APP_ORIGIN}/auth/confirm#?error_description=Email+link+is+invalid`,
      ),
    ).toEqual({
      kind: "auth_confirm",
      client: null,
      params: { error_description: "Email link is invalid" },
    });
  });

  it("ignores a __proto__ param instead of polluting the params object", () => {
    const intent = parseHavenLink(
      `${HAVEN_APP_ORIGIN}/auth/confirm?__proto__=x&type=signup`,
    );
    expect(intent.kind).toBe("auth_confirm");
    if (intent.kind !== "auth_confirm") return;
    expect(intent.params.type).toBe("signup");
    expect(Object.getPrototypeOf(intent.params)).toBeNull();
  });
});

describe("parseHavenLink — origins", () => {
  const preview = "https://haven-abc123-cody-magnusons-projects.vercel.app";

  it("rejects a preview origin unless the caller allows it", () => {
    expect(kindOf(`${preview}/invite/abcdef0123`)).toBe("unsupported");
    expect(kindOf(`${preview}/invite/abcdef0123`, [preview])).toBe("invite");
    expect(kindOf(`${preview}/invite/abcdef0123`, [`${preview}/`])).toBe(
      "invite",
    );
  });

  it("accepts local dev when allowed, including the port", () => {
    expect(
      kindOf("http://localhost:5174/notifications", ["http://localhost:5174"]),
    ).toBe("notifications");
    expect(
      kindOf("http://localhost:9999/notifications", ["http://localhost:5174"]),
    ).toBe("unsupported");
  });

  it.each([
    "http://haven.redrixx.com/invite/abcdef0123",
    "https://haven.redrixx.com.evil.example/invite/abcdef0123",
    "https://haven.redrixx.com@evil.example/invite/abcdef0123",
    "https://evil.example/invite/abcdef0123",
    "//haven.redrixx.com/invite/abcdef0123",
    "ftp://haven.redrixx.com/invite/abcdef0123",
  ])("rejects look-alike origin %s", (input) => {
    expect(kindOf(input)).toBe("unsupported");
  });

  it("accepts the legacy marketing host for auth confirm only", () => {
    expect(
      parseHavenLink(
        "https://projects.haven.redrixx.com/auth/confirm?token_hash=t&type=signup",
      ),
    ).toEqual({
      kind: "auth_confirm",
      client: null,
      params: { token_hash: "t", type: "signup" },
    });
    expect(kindOf("https://projects.haven.redrixx.com/invite/abcdef0123")).toBe(
      "unsupported",
    );
    expect(kindOf("https://projects.haven.redrixx.com/auth/confirm/web")).toBe(
      "unsupported",
    );
  });
});

describe("parseHavenLink — push notification data.url", () => {
  // Exact shapes expo-push-worker builds with URLSearchParams.
  it("reads a DM push", () => {
    expect(
      parseHavenLink(
        "/?kind=dm_message&conversationId=c1&recipientId=r&eventId=e",
      ),
    ).toEqual({ kind: "dm", conversationId: "c1" });
  });

  it("opens the requests tab for a received friend request", () => {
    expect(
      parseHavenLink("/?kind=friend_request_received&friendRequestId=fr1"),
    ).toEqual({ kind: "friends", tab: "requests", requestId: "fr1" });
  });

  it("opens the friends tab for an accepted friend request", () => {
    expect(parseHavenLink("/?kind=friend_request_accepted")).toEqual({
      kind: "friends",
      tab: "friends",
      requestId: null,
    });
  });

  it("reads a channel mention push", () => {
    expect(
      parseHavenLink("/?kind=channel_mention&communityId=srv&channelId=ch"),
    ).toEqual({ kind: "channel", communityId: "srv", channelId: "ch" });
  });

  it("falls back to notifications when a push is missing its ids", () => {
    expect(parseHavenLink("/?kind=dm_message")).toEqual({
      kind: "notifications",
    });
    expect(parseHavenLink("/?kind=channel_mention&communityId=srv")).toEqual({
      kind: "notifications",
    });
    expect(parseHavenLink("/?kind=system")).toEqual({ kind: "notifications" });
  });

  it("treats a bare / (the system push url) as home", () => {
    expect(parseHavenLink("/")).toEqual({ kind: "home" });
  });

  it("rejects an unknown push kind", () => {
    expect(kindOf("/?kind=bogus")).toBe("unsupported");
  });
});

describe("parseHavenLink — bare invite codes and junk", () => {
  it.each([
    ["abcdef0123", "ABCDEF0123"],
    ["  ABCDEF0123  ", "ABCDEF0123"],
  ])("reads bare code %j", (input, code) => {
    expect(parseHavenLink(input)).toEqual({ kind: "invite", code });
  });

  it.each([
    "",
    "   ",
    "hello",
    "ABCDEF012",
    "ABCDEF01234",
    "ZZZZZZZZZZ",
    "haven://invite/%E0%A4%A",
    "https://haven.redrixx.com/direct-messages/%",
  ])("returns unsupported for %j without throwing", (input) => {
    expect(() => parseHavenLink(input)).not.toThrow();
    expect(kindOf(input)).toBe("unsupported");
  });
});

describe("buildHavenLink", () => {
  const buildable: BuildableHavenLinkIntent[] = [
    { kind: "home" },
    { kind: "invite", code: "ABCDEF0123" },
    { kind: "community", communityId: "c1" },
    { kind: "channel", communityId: "c 1", channelId: "ch/1" },
    { kind: "dm", conversationId: "d1" },
    { kind: "friends", tab: "friends", requestId: null },
    { kind: "friends", tab: "requests", requestId: null },
    { kind: "friends", tab: "requests", requestId: "fr1" },
    { kind: "notifications" },
    { kind: "auth_confirm", client: null, params: {} },
    {
      kind: "auth_confirm",
      client: "desktop",
      params: { token_hash: "a+b/c=", type: "recovery" },
    },
  ];

  it("builds canonical https links on the app origin", () => {
    expect(buildHavenLink({ kind: "invite", code: "ABCDEF0123" })).toBe(
      "https://haven.redrixx.com/invite/ABCDEF0123",
    );
    expect(
      buildHavenLink({ kind: "auth_confirm", client: "ios", params: {} }),
    ).toBe("https://haven.redrixx.com/auth/confirm/ios");
    expect(
      buildHavenLink({ kind: "friends", tab: "requests", requestId: "fr1" }),
    ).toBe("https://haven.redrixx.com/friends?tab=requests&request=fr1");
  });

  it("builds on a custom origin with or without a trailing slash", () => {
    expect(
      buildHavenLink({ kind: "notifications" }, "http://localhost:5174/"),
    ).toBe("http://localhost:5174/notifications");
  });

  it.each(buildable.map((intent) => [intent.kind, intent] as const))(
    "round-trips %s through parseHavenLink",
    (_kind, intent) => {
      expect(parseHavenLink(buildHavenLink(intent))).toEqual(intent);
    },
  );

  describe("buildHavenSchemeLink", () => {
    it("hands an auth link to the installed app, client and params intact", () => {
      expect(
        buildHavenSchemeLink({
          kind: "auth_confirm",
          client: "desktop",
          params: { token_hash: "th", type: "recovery" },
        }),
      ).toBe("haven://auth/confirm/desktop?token_hash=th&type=recovery");
    });

    it("keeps exactly two slashes after the scheme", () => {
      expect(buildHavenSchemeLink({ kind: "home" })).toBe("haven://");
      expect(buildHavenSchemeLink({ kind: "invite", code: "ABCDEF0123" })).toBe(
        "haven://invite/ABCDEF0123",
      );
    });

    it.each(buildable.map((intent) => [intent.kind, intent] as const))(
      "round-trips %s through parseHavenLink",
      (_kind, intent) => {
        expect(parseHavenLink(buildHavenSchemeLink(intent))).toEqual(intent);
      },
    );
  });
});
