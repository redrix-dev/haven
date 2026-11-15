import { describe, expect, it } from "vitest";
import type { HavenSolidCore } from "@solid-client/core";
import type { Permission } from "@shared/lib/backend/records";
import { visibleCommunitySettingsTabs } from "../communitySettingsAccess";

/** A core whose person holds these permissions in every community. */
const holding = (...held: Permission[]) =>
  ({
    communities: { can: (_id: string, p: Permission) => held.includes(p) },
  }) as unknown as HavenSolidCore;

describe("community settings access", () => {
  it("keeps overview available so every member can leave a community", () => {
    expect(visibleCommunitySettingsTabs(holding(), "hearth")).toEqual([
      "overview",
    ]);
  });

  it("adds each tab only with its own permission", () => {
    expect(
      visibleCommunitySettingsTabs(
        holding("manage_channels", "manage_roles", "manage_invites"),
        "hearth",
      ),
    ).toEqual(["overview", "channels", "roles", "invites"]);
    expect(
      visibleCommunitySettingsTabs(holding("manage_invites"), "hearth"),
    ).toEqual(["overview", "invites"]);
    expect(
      visibleCommunitySettingsTabs(holding("manage_community"), "hearth"),
    ).toEqual(["overview"]);
  });
});
