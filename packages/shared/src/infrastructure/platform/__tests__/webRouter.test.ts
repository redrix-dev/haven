import { describe, expect, it } from "vitest";
import { parseRouteFromPath } from "@shared/infrastructure/platform/webRouter";

describe("parseRouteFromPath", () => {
  it("returns none for root path", () => {
    expect(parseRouteFromPath("/")).toEqual({ kind: "none" });
    expect(parseRouteFromPath("")).toEqual({ kind: "none" });
  });

  it("parses community-only route", () => {
    expect(parseRouteFromPath("/c/s1")).toEqual({
      kind: "community",
      communityId: "s1",
      channelId: null,
    });
  });

  it("parses community + channel route", () => {
    expect(parseRouteFromPath("/c/s1/c1")).toEqual({
      kind: "community",
      communityId: "s1",
      channelId: "c1",
    });
  });

  it("parses DM route", () => {
    expect(parseRouteFromPath("/dm/dm1")).toEqual({
      kind: "dm",
      conversationId: "dm1",
    });
  });

  it("treats unknown paths as none", () => {
    expect(parseRouteFromPath("/settings")).toEqual({ kind: "none" });
  });

  it("ignores trailing slashes", () => {
    expect(parseRouteFromPath("/c/s1/c1/")).toEqual({
      kind: "community",
      communityId: "s1",
      channelId: "c1",
    });
  });
});
