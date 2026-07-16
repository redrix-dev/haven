import { describe, expect, it } from "vitest";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";
import {
  canOpenCommunitySettingsPanel,
  visibleCommunitySettingsTabs,
} from "../communitySettingsAccess";

describe("community settings access", () => {
  it("keeps overview available so every member can leave a community", () => {
    expect(visibleCommunitySettingsTabs(EMPTY_PERMISSIONS)).toEqual([
      "overview",
    ]);
    expect(canOpenCommunitySettingsPanel(EMPTY_PERMISSIONS)).toBe(true);
  });

  it("adds governance tabs only for their matching permissions", () => {
    expect(
      visibleCommunitySettingsTabs({
        ...EMPTY_PERMISSIONS,
        canCreateChannels: true,
        canManageRoles: true,
        canManageInvites: true,
      }),
    ).toEqual(["overview", "channels", "roles", "invites"]);
  });
});
