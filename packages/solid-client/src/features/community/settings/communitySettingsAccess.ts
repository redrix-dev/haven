import type { ServerPermissions } from "@shared/lib/backend/types";
import type { CommunitySettingsTab } from "@shared/core/sessionStorePorts";

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

/** True when the settings panel has at least one tab to show. */
export function canOpenCommunitySettingsPanel(
  perms: ServerPermissions,
): boolean {
  return visibleCommunitySettingsTabs(perms).length > 0;
}

/** Tabs the viewer is allowed to see in the community settings panel. */
export function visibleCommunitySettingsTabs(
  perms: ServerPermissions,
): CommunitySettingsTab[] {
  const tabs: CommunitySettingsTab[] = ["overview"];
  if (perms.canCreateChannels || perms.canManageChannelStructure) {
    tabs.push("channels");
  }
  if (perms.canManageRoles) tabs.push("roles");
  if (perms.canManageInvites) tabs.push("invites");
  return tabs;
}

export function defaultCommunitySettingsTab(
  perms: ServerPermissions,
): CommunitySettingsTab | null {
  return visibleCommunitySettingsTabs(perms)[0] ?? null;
}
