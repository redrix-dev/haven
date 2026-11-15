import type { Permission } from "@shared/lib/backend/records";

/**
 * How each community permission is shown in the role editor, both platforms.
 * Keyed by the database's own names (`community_permission`), so a new
 * permission in the database is a type error here until it has words.
 */

export type PermissionGroup =
  | "channels"
  | "messages"
  | "members"
  | "community"
  | "reports";

export type PermissionInfo = {
  label: string;
  description: string;
  group: PermissionGroup;
};

export const PERMISSION_CATALOG: Record<Permission, PermissionInfo> = {
  view_channels: {
    label: "View channels",
    description: "See the community's channels and read their messages.",
    group: "channels",
  },
  send_messages: {
    label: "Send messages",
    description: "Write in the channels they can see.",
    group: "channels",
  },
  manage_channels: {
    label: "Manage channels",
    description: "Create, rename, move and delete channels and categories.",
    group: "channels",
  },
  manage_channel_permissions: {
    label: "Manage channel permissions",
    description: "Set who may view, send or manage in each channel.",
    group: "channels",
  },
  manage_messages: {
    label: "Manage messages",
    description: "Delete anyone's messages.",
    group: "messages",
  },
  view_hidden_messages: {
    label: "See hidden messages",
    description: "Still see the messages of someone who is banned.",
    group: "messages",
  },
  manage_members: {
    label: "Manage members",
    description: "Kick members, set nicknames, and moderate voice.",
    group: "members",
  },
  manage_bans: {
    label: "Manage bans",
    description: "Ban and unban members.",
    group: "members",
  },
  manage_roles: {
    label: "Manage roles",
    description: "Create and edit roles below their own, and hand them out.",
    group: "members",
  },
  manage_community: {
    label: "Manage community",
    description: "Change the community's name, description and settings.",
    group: "community",
  },
  manage_invites: {
    label: "Manage invites",
    description: "Create and revoke invite links.",
    group: "community",
  },
  view_audit_log: {
    label: "View audit log",
    description: "See what moderators and managers have done.",
    group: "community",
  },
  create_reports: {
    label: "Report to moderators",
    description: "Send reports to this community's moderators.",
    group: "reports",
  },
  manage_reports: {
    label: "Handle reports",
    description: "Read and act on reports in modmail.",
    group: "reports",
  },
};

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  channels: "Channels",
  messages: "Messages",
  members: "Members",
  community: "Community",
  reports: "Reports",
};

/** The permissions in each group, in the order the editor shows them. */
export function permissionGroups(): {
  group: PermissionGroup;
  label: string;
  permissions: (PermissionInfo & { key: Permission })[];
}[] {
  return (Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroup[]).map(
    (group) => ({
      group,
      label: PERMISSION_GROUP_LABELS[group],
      permissions: (Object.keys(PERMISSION_CATALOG) as Permission[])
        .filter((key) => PERMISSION_CATALOG[key].group === group)
        .map((key) => ({ key, ...PERMISSION_CATALOG[key] })),
    }),
  );
}
