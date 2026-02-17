import { Database } from '@/types/database';

export type Channel = Database['public']['Tables']['channels']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type DeveloperAccessMode = Database['public']['Enums']['developer_access_mode'];
export type ChannelKind = Database['public']['Enums']['channel_kind'];

export type ServerSummary = {
  id: string;
  name: string;
  created_at: string;
};

export type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
};

export type ServerPermissions = {
  isOwner: boolean;
  canManageServer: boolean;
  canCreateChannels: boolean;
  canManageChannels: boolean;
  canManageDeveloperAccess: boolean;
  canManageInvites: boolean;
};

export type ServerSettingsSnapshot = {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
  developerAccessEnabled: boolean;
  developerAccessMode: DeveloperAccessMode;
  developerAccessChannelIds: string[];
};

export type ServerSettingsUpdate = {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
  developerAccessEnabled: boolean;
  developerAccessMode: DeveloperAccessMode;
  developerAccessChannelIds: string[];
};

export type ServerInvite = {
  id: string;
  code: string;
  currentUses: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
};

export type RedeemedInvite = {
  communityId: string;
  communityName: string;
  joined: boolean;
};

export type ChannelPermissionState = {
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelCreateInput = {
  communityId: string;
  name: string;
  topic: string | null;
  kind: ChannelKind;
  createdByUserId: string;
  position: number;
};

export type ChannelRolePermissionItem = {
  roleId: string;
  name: string;
  color: string;
  isDefault: boolean;
  editable: boolean;
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelMemberPermissionItem = {
  memberId: string;
  displayName: string;
  isOwner: boolean;
  canView: boolean | null;
  canSend: boolean | null;
  canManage: boolean | null;
};

export type ChannelMemberOption = {
  memberId: string;
  displayName: string;
  isOwner: boolean;
};

export type ChannelPermissionsSnapshot = {
  rolePermissions: ChannelRolePermissionItem[];
  memberPermissions: ChannelMemberPermissionItem[];
  memberOptions: ChannelMemberOption[];
};
