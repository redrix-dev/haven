import { describe, expect, it } from "vitest";
import { applyCommunityDisplayOrder } from "@shared/core/communityDisplayOrder";

describe("applyCommunityDisplayOrder", () => {
  const items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];

  it("returns source order when no saved order exists", () => {
    expect(applyCommunityDisplayOrder(items, null)).toEqual(items);
    expect(applyCommunityDisplayOrder(items, [])).toEqual(items);
  });

  it("applies saved order and appends new communities", () => {
    expect(applyCommunityDisplayOrder(items, ["c", "a"])).toEqual([
      { id: "c", name: "Gamma" },
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ]);
  });

  it("returns the original array reference when order already matches", () => {
    const ordered = applyCommunityDisplayOrder(items, ["a", "b", "c"]);
    expect(ordered).toBe(items);
  });
});
