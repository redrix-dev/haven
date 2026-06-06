import type { PermissionCatalogItem } from "@shared/lib/backend/types";

/**
 * Permission display metadata + grouping for the mobile role editor.
 *
 * NOTE: This mirrors the inline metadata in the desktop
 * `packages/web-client/src/components/community/ServerSettingsModal.tsx`. The two
 * should eventually consolidate into a shared module; kept mobile-local for now to
 * avoid touching the desktop/web build. Keep them in sync if permissions change.
 */

export type PermissionScope =
  | "channel_access"
  | "channel_structure"
  | "channel_overwrites"
  | "community_admin"
  | "role_admin"
  | "member_admin"
  | "message_admin"
  | "invite_admin"
  | "reporting"
  | "developer"
  | "moderation"
  | "reserved";

type PermissionMetadata = {
  label: string;
  description?: string;
  scope: PermissionScope;
  ownerVisible: boolean;
};

const PERMISSION_SCOPE_ORDER: PermissionScope[] = [
  "community_admin",
  "role_admin",
  "member_admin",
  "channel_access",
  "channel_structure",
  "channel_overwrites",
  "message_admin",
  "invite_admin",
  "reporting",
  "moderation",
  "developer",
  "reserved",
];

const PERMISSION_SCOPE_LABELS: Record<PermissionScope, string> = {
  channel_access: "Channel Access",
  channel_structure: "Channel Structure",
  channel_overwrites: "Channel Overwrites",
  community_admin: "Community Administration",
  role_admin: "Role Management",
  member_admin: "Member Management",
  message_admin: "Message Moderation",
  invite_admin: "Invites",
  reporting: "Reports",
  developer: "Developer Tools",
  moderation: "Safety Moderation",
  reserved: "Reserved",
};

const COMMUNITY_PERMISSION_METADATA: Record<string, PermissionMetadata> = {
  view_channels: { label: "View Channels", scope: "channel_access", ownerVisible: true },
  send_messages: { label: "Send Messages", scope: "channel_access", ownerVisible: true },
  create_channels: { label: "Create Channels", scope: "channel_structure", ownerVisible: true },
  manage_channels: { label: "Manage Channel Structure", scope: "channel_structure", ownerVisible: true },
  manage_channel_permissions: { label: "Manage Channel Overwrites", scope: "channel_overwrites", ownerVisible: true },
  manage_messages: { label: "Manage Messages", scope: "message_admin", ownerVisible: true },
  manage_server: { label: "Manage Community", scope: "community_admin", ownerVisible: true },
  manage_roles: { label: "Manage Roles", scope: "role_admin", ownerVisible: true },
  manage_members: { label: "Manage Members", scope: "member_admin", ownerVisible: true },
  manage_invites: { label: "Manage Invites", scope: "invite_admin", ownerVisible: true },
  create_reports: { label: "Create Reports", scope: "reporting", ownerVisible: true },
  manage_reports: { label: "Manage Reports", scope: "reporting", ownerVisible: true },
  manage_developer_access: { label: "Manage Developer Access", scope: "developer", ownerVisible: true },
  manage_bans: { label: "Manage Bans", scope: "moderation", ownerVisible: true },
  can_view_ban_hidden: {
    label: "View Hidden Messages",
    description: "Can see messages hidden by bans.",
    scope: "moderation",
    ownerVisible: true,
  },
  refresh_link_previews: { label: "Refresh Link Previews", scope: "developer", ownerVisible: true },
  ["mention_haven_" + "developers"]: {
    label: "Mention Haven Moderation Team",
    scope: "reserved",
    ownerVisible: false,
  },
};

// Permissions desktop hides from the role editor (managed elsewhere / not user-facing here).
const HIDDEN_PERMISSION_KEYS = new Set([
  "create_reports",
  "manage_developer_access",
  "refresh_link_previews",
]);

export const fallbackPermissionLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export type PermissionGroup = {
  scope: PermissionScope;
  label: string;
  permissions: { key: string; label: string; description: string }[];
};

/** Group a permission catalog into ordered, display-ready sections (mirrors desktop). */
export function buildVisiblePermissionGroups(
  permissionsCatalog: PermissionCatalogItem[],
): PermissionGroup[] {
  const grouped = new Map<PermissionScope, PermissionGroup["permissions"]>();

  for (const permission of permissionsCatalog) {
    if (HIDDEN_PERMISSION_KEYS.has(permission.key)) continue;

    const metadata = COMMUNITY_PERMISSION_METADATA[permission.key];
    if (metadata && !metadata.ownerVisible) continue;

    const scope = metadata?.scope ?? "community_admin";
    const group = grouped.get(scope) ?? [];
    group.push({
      key: permission.key,
      label: metadata?.label ?? fallbackPermissionLabel(permission.key),
      description: metadata?.description ?? permission.description,
    });
    grouped.set(scope, group);
  }

  return PERMISSION_SCOPE_ORDER.map((scope) => ({
    scope,
    label: PERMISSION_SCOPE_LABELS[scope],
    permissions: grouped.get(scope) ?? [],
  })).filter((group) => group.permissions.length > 0);
}
