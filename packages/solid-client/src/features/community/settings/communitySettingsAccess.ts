import type { HavenSolidCore } from "@solid-client/core";
import type { CommunitySettingsTab } from "@solid-client/data/screen";

export type { CommunitySettingsTab };

export const COMMUNITY_SETTINGS_TAB_LABELS: Record<
  CommunitySettingsTab,
  string
> = {
  overview: "Overview",
  channels: "Channels",
  roles: "Roles",
  invites: "Invites",
};

/**
 * The tabs of the settings panel the person may use, from what the database
 * says they may do here (`get_my_permissions`). The overview is for everyone:
 * it is where a member leaves.
 */
export function visibleCommunitySettingsTabs(
  core: HavenSolidCore,
  communityId: string,
): CommunitySettingsTab[] {
  const tabs: CommunitySettingsTab[] = ["overview"];
  if (core.communities.can(communityId, "manage_channels"))
    tabs.push("channels");
  if (core.communities.can(communityId, "manage_roles")) tabs.push("roles");
  if (core.communities.can(communityId, "manage_invites")) tabs.push("invites");
  return tabs;
}
