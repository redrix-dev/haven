import { describe, expect, it } from "vitest";
import { resolveCommunityEntrypointTarget } from "@shared/core";

describe("resolveCommunityEntrypointTarget", () => {
  it("restores the active community when it is still in the list", () => {
    expect(
      resolveCommunityEntrypointTarget({
        activeCommunityId: "c2",
        communityIds: ["c1", "c2", "c3"],
      }),
    ).toEqual({
      communityId: "c2",
      restoredActiveCommunity: true,
    });
  });

  it("falls back to the first community when the active community is stale", () => {
    expect(
      resolveCommunityEntrypointTarget({
        activeCommunityId: "missing",
        communityIds: ["c1", "c2"],
      }),
    ).toEqual({
      communityId: "c1",
      restoredActiveCommunity: false,
    });
  });

  it("returns null when the viewer has no communities", () => {
    expect(
      resolveCommunityEntrypointTarget({
        activeCommunityId: "missing",
        communityIds: [],
      }),
    ).toEqual({
      communityId: null,
      restoredActiveCommunity: false,
    });
  });
});
