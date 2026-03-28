import React, { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/components/ui/alert-dialog";
import { Button } from "@shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { Skeleton } from "@shared/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@shared/components/ui/tabs";
import { getErrorMessage } from "@platform/lib/errors";
import type {
  CommunityBanItem,
  PermissionCatalogItem,
  ServerMemberRoleItem,
  ServerRoleItem,
} from "@shared/lib/backend/types";
import { BansTab } from "./settingsModals/tabs/BansTab";
import { InvitesTab } from "./settingsModals/tabs/InvitesTab";
import { GeneralTab } from "./settingsModals/tabs/GeneralTab";
import { RolesTab } from "./settingsModals/tabs/RolesTab";
import { MembersTab } from "./settingsModals/tabs/MembersTab";
type SettingsTab = "general" | "roles" | "members" | "invites" | "bans";

type RoleDraft = {
  name: string;
  color: string;
  position: number;
  permissionKeys: string[];
};
type ServerSettingsConfirmState =
  | { kind: "deleteRole"; roleId: string; roleName: string }
  | { kind: "unbanUser"; targetUserId: string; username: string };

export interface ServerSettingsValues {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
}

export interface ServerInviteItem {
  id: string;
  code: string;
  currentUses: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
}

interface ServerSettingsModalProps {
  initialValues: ServerSettingsValues | null;
  loadingInitialValues: boolean;
  initialLoadError: string | null;
  canManageServer: boolean;
  canManageRoles: boolean;
  canManageMembers: boolean;
  canManageBans: boolean;
  isOwner: boolean;
  roles: ServerRoleItem[];
  members: ServerMemberRoleItem[];
  permissionsCatalog: PermissionCatalogItem[];
  roleManagementLoading: boolean;
  roleManagementError: string | null;
  canManageInvites: boolean;
  invites: ServerInviteItem[];
  invitesLoading: boolean;
  invitesError: string | null;
  bans: CommunityBanItem[];
  bansLoading: boolean;
  bansError: string | null;
  inviteBaseUrl: string;
  onClose: () => void;
  onSave: (values: ServerSettingsValues) => Promise<void>;
  onCreateRole: (values: {
    name: string;
    color: string;
    position: number;
  }) => Promise<void>;
  onUpdateRole: (values: {
    roleId: string;
    name: string;
    color: string;
    position: number;
  }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSaveRolePermissions: (
    roleId: string,
    permissionKeys: string[],
  ) => Promise<void>;
  onSaveMemberRoles: (memberId: string, roleIds: string[]) => Promise<void>;
  onCreateInvite: (values: {
    maxUses: number | null;
    expiresInHours: number | null;
  }) => Promise<ServerInviteItem>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onUnbanUser: (values: {
    targetUserId: string;
    reason?: string | null;
  }) => Promise<void>;
}

type PermissionScope =
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
  view_channels: {
    label: "View Channels",
    scope: "channel_access",
    ownerVisible: true,
  },
  send_messages: {
    label: "Send Messages",
    scope: "channel_access",
    ownerVisible: true,
  },
  create_channels: {
    label: "Create Channels",
    scope: "channel_structure",
    ownerVisible: true,
  },
  manage_channels: {
    label: "Manage Channel Structure",
    scope: "channel_structure",
    ownerVisible: true,
  },
  manage_channel_permissions: {
    label: "Manage Channel Overwrites",
    scope: "channel_overwrites",
    ownerVisible: true,
  },
  manage_messages: {
    label: "Manage Messages",
    scope: "message_admin",
    ownerVisible: true,
  },
  manage_server: {
    label: "Manage Community",
    scope: "community_admin",
    ownerVisible: true,
  },
  manage_roles: {
    label: "Manage Roles",
    scope: "role_admin",
    ownerVisible: true,
  },
  manage_members: {
    label: "Manage Members",
    scope: "member_admin",
    ownerVisible: true,
  },
  manage_invites: {
    label: "Manage Invites",
    scope: "invite_admin",
    ownerVisible: true,
  },
  create_reports: {
    label: "Create Reports",
    scope: "reporting",
    ownerVisible: true,
  },
  manage_reports: {
    label: "Manage Reports",
    scope: "reporting",
    ownerVisible: true,
  },
  manage_developer_access: {
    label: "Manage Developer Access",
    scope: "developer",
    ownerVisible: true,
  },
  manage_bans: {
    label: "Manage Bans",
    scope: "moderation",
    ownerVisible: true,
  },
  can_view_ban_hidden: {
    label: "View Hidden Messages",
    description: "Can see messages hidden by bans.",
    scope: "moderation",
    ownerVisible: true,
  },
  refresh_link_previews: {
    label: "Refresh Link Previews",
    scope: "developer",
    ownerVisible: true,
  },
  ['mention_haven_' + 'developers']: {
    label: "Mention Haven Moderation Team",
    scope: "reserved",
    ownerVisible: false,
  },
};

const fallbackPermissionLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function ServerSettingsModal({
  initialValues,
  loadingInitialValues,
  initialLoadError,
  canManageServer,
  canManageRoles,
  canManageMembers,
  canManageBans,
  isOwner,
  roles,
  members,
  permissionsCatalog,
  roleManagementLoading,
  roleManagementError,
  canManageInvites,
  invites,
  invitesLoading,
  invitesError,
  bans,
  bansLoading,
  bansError,
  inviteBaseUrl,
  onClose,
  onSave,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onSaveRolePermissions,
  onSaveMemberRoles,
  onCreateInvite,
  onRevokeInvite,
  onUnbanUser,
}: ServerSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [values, setValues] = useState<ServerSettingsValues | null>(
    initialValues,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#7289da");
  const [roleActionSaving, setRoleActionSaving] = useState(false);
  const [roleActionError, setRoleActionError] = useState<string | null>(null);

  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDraftRoleIds, setMemberDraftRoleIds] = useState<string[]>([]);
  const [memberActionSaving, setMemberActionSaving] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(
    null,
  );

  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteMaxUsesInput, setInviteMaxUsesInput] = useState("");
  const [inviteExpiryHoursInput, setInviteExpiryHoursInput] = useState("1");
  const [inviteActionError, setInviteActionError] = useState<string | null>(
    null,
  );
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [unbanActionError, setUnbanActionError] = useState<string | null>(null);
  const [unbanBusyUserId, setUnbanBusyUserId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<ServerSettingsConfirmState | null>(null);

  useEffect(() => {
    setValues(initialValues);
    setError(null);
  }, [initialValues]);

  useEffect(() => {
    if (selectedRoleId && roles.some((role) => role.id === selectedRoleId))
      return;
    setSelectedRoleId(roles[0]?.id ?? null);
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  useEffect(() => {
    if (!selectedRole) {
      setRoleDraft(null);
      return;
    }
    setRoleDraft({
      name: selectedRole.name,
      color: selectedRole.color,
      position: selectedRole.position,
      permissionKeys: selectedRole.permissionKeys,
    });
    setRoleActionError(null);
  }, [selectedRole]);

  useEffect(() => {
    if (
      selectedMemberId &&
      members.some((member) => member.memberId === selectedMemberId)
    )
      return;
    setSelectedMemberId(members[0]?.memberId ?? null);
  }, [members, selectedMemberId]);

  const selectedMember = useMemo(
    () =>
      members.find((member) => member.memberId === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  useEffect(() => {
    if (!selectedMember) {
      setMemberDraftRoleIds([]);
      return;
    }
    setMemberDraftRoleIds(selectedMember.roleIds);
    setMemberActionError(null);
  }, [selectedMember]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      member.displayName.toLowerCase().includes(query),
    );
  }, [members, memberSearch]);

  const defaultRoleId = useMemo(
    () => roles.find((role) => role.isDefault)?.id ?? null,
    [roles],
  );

  const visiblePermissionGroups = useMemo(() => {
    const grouped = new Map<
      PermissionScope,
      Array<{ key: string; label: string; description: string }>
    >();

    for (const permission of permissionsCatalog) {
      if (
        permission.key === "create_reports" ||
        permission.key === "manage_developer_access" ||
        permission.key === "refresh_link_previews"
      ) {
        continue; // CHECKPOINT 3 COMPLETE
      }
      const metadata = COMMUNITY_PERMISSION_METADATA[permission.key];
      const ownerVisible = metadata?.ownerVisible ?? true;
      if (!ownerVisible) continue;

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
  }, [permissionsCatalog]);

  const canEditSelectedRoleDetails =
    Boolean(selectedRole) &&
    canManageRoles &&
    (!selectedRole?.isSystem || isOwner) &&
    !selectedRole?.isDefault;

  const canEditSelectedRolePermissions =
    Boolean(selectedRole) &&
    canManageRoles &&
    (!selectedRole?.isSystem || isOwner);

  const canDeleteSelectedRole =
    Boolean(selectedRole) &&
    canManageRoles &&
    !selectedRole?.isDefault &&
    (!selectedRole?.isSystem || isOwner);

  const parsePositiveIntegerOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numericValue = Number(trimmed);
    if (!Number.isInteger(numericValue) || numericValue <= 0) return null;
    return numericValue;
  };

  const copyInviteLink = async (inviteCode: string, inviteId: string) => {
    const link = `${inviteBaseUrl}${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(inviteId);
      setTimeout(
        () =>
          setCopiedInviteId((current) =>
            current === inviteId ? null : current,
          ),
        1200,
      );
    } catch {
      setInviteActionError("Failed to copy invite link to clipboard.");
    }
  };

  const handleSave = async () => {
    if (!values) return;
    if (!values.name.trim()) {
      setError("Community name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        description: values.description?.trim()
          ? values.description.trim()
          : null,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save community settings."));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!canManageRoles) return;
    const trimmedName = newRoleName.trim();
    if (!trimmedName) {
      setRoleActionError("Role name is required.");
      return;
    }
    const nextPosition =
      roles.length === 0
        ? 1
        : Math.max(...roles.map((role) => role.position)) + 1;
    setRoleActionSaving(true);
    setRoleActionError(null);
    try {
      await onCreateRole({
        name: trimmedName,
        color: newRoleColor,
        position: nextPosition,
      });
      setNewRoleName("");
    } catch (err: unknown) {
      setRoleActionError(getErrorMessage(err, "Failed to create role."));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const toggleDraftPermission = (permissionKey: string) => {
    if (!roleDraft) return;
    const hasPermission = roleDraft.permissionKeys.includes(permissionKey);
    setRoleDraft({
      ...roleDraft,
      permissionKeys: hasPermission
        ? roleDraft.permissionKeys.filter((key) => key !== permissionKey)
        : [...roleDraft.permissionKeys, permissionKey],
    });
  };

  const handleSaveRole = async () => {
    if (!selectedRoleId || !roleDraft) return;
    const trimmedName = roleDraft.name.trim();
    if (!trimmedName) {
      setRoleActionError("Role name is required.");
      return;
    }
    setRoleActionSaving(true);
    setRoleActionError(null);
    try {
      await onUpdateRole({
        roleId: selectedRoleId,
        name: trimmedName,
        color: roleDraft.color,
        position: Number.isFinite(roleDraft.position) ? roleDraft.position : 0,
      });
      await onSaveRolePermissions(selectedRoleId, roleDraft.permissionKeys);
    } catch (err: unknown) {
      setRoleActionError(getErrorMessage(err, "Failed to save role changes."));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const handleDeleteRole = () => {
    if (!selectedRoleId || !selectedRole) return;
    setPendingConfirm({
      kind: "deleteRole",
      roleId: selectedRoleId,
      roleName: selectedRole.name,
    });
  };

  const confirmDeleteRole = async (roleId: string) => {
    setRoleActionSaving(true);
    setRoleActionError(null);
    try {
      await onDeleteRole(roleId);
      setSelectedRoleId(null);
    } catch (err: unknown) {
      setRoleActionError(getErrorMessage(err, "Failed to delete role."));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const toggleMemberRole = (roleId: string) => {
    setMemberDraftRoleIds((currentRoleIds) =>
      currentRoleIds.includes(roleId)
        ? currentRoleIds.filter((id) => id !== roleId)
        : [...currentRoleIds, roleId],
    );
  };

  const handleSaveMemberRoles = async () => {
    if (!selectedMemberId) return;
    const nextRoleIds = Array.from(
      new Set([
        ...memberDraftRoleIds,
        ...(defaultRoleId ? [defaultRoleId] : []),
      ]),
    );
    setMemberActionSaving(true);
    setMemberActionError(null);
    try {
      await onSaveMemberRoles(selectedMemberId, nextRoleIds);
    } catch (err: unknown) {
      setMemberActionError(
        getErrorMessage(err, "Failed to save member roles."),
      );
    } finally {
      setMemberActionSaving(false);
    }
  };

  const handleCreateInvite = async () => {
    const maxUses = parsePositiveIntegerOrNull(inviteMaxUsesInput);
    const parsedExpiresInHours = parsePositiveIntegerOrNull(
      inviteExpiryHoursInput,
    );
    const expiresInHours = parsedExpiresInHours ?? 1;

    if (inviteMaxUsesInput.trim() && maxUses === null) {
      setInviteActionError("Max uses must be a whole number greater than 0.");
      return;
    }
    if (inviteExpiryHoursInput.trim() && parsedExpiresInHours === null) {
      setInviteActionError("Expiration must be a whole number greater than 0.");
      return;
    }
    setInviteCreating(true);
    setInviteActionError(null);
    try {
      const invite = await onCreateInvite({ maxUses, expiresInHours });
      await copyInviteLink(invite.code, invite.id);
    } catch (err: unknown) {
      setInviteActionError(
        getErrorMessage(err, "Failed to create invite link."),
      );
    } finally {
      setInviteCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setInviteActionError(null);
    try {
      await onRevokeInvite(inviteId);
    } catch (err: unknown) {
      setInviteActionError(
        getErrorMessage(err, "Failed to revoke invite link."),
      );
    }
  };

  const handleUnban = (targetUserId: string, username: string) => {
    if (!canManageBans) return;
    setPendingConfirm({ kind: "unbanUser", targetUserId, username });
  };

  const confirmUnban = async (targetUserId: string) => {
    setUnbanActionError(null);
    setUnbanBusyUserId(targetUserId);
    try {
      await onUnbanUser({ targetUserId, reason: null });
    } catch (err: unknown) {
      setUnbanActionError(getErrorMessage(err, "Failed to unban user."));
    } finally {
      setUnbanBusyUserId(null);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirm) return;
    const nextConfirm = pendingConfirm;
    setPendingConfirm(null);
    if (nextConfirm.kind === "deleteRole") {
      await confirmDeleteRole(nextConfirm.roleId);
      return;
    }
    await confirmUnban(nextConfirm.targetUserId);
  };

  const pendingConfirmBusy =
    pendingConfirm?.kind === "deleteRole"
      ? roleActionSaving
      : pendingConfirm?.kind === "unbanUser" &&
        unbanBusyUserId === pendingConfirm.targetUserId;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        {/*
          DialogContent is a fixed-size flex column:
            - shrink-0 header
            - flex-1 min-h-0 content area (tabs live here)
            - shrink-0 footer
          overflow is NEVER on DialogContent itself — children own their scroll regions.
        */}
        <DialogContent
          size="app"
          className="bg-[#18243a] border-[#142033] text-white
            md:w-[min(95vw,1160px)] md:max-w-none
            md:h-[min(88dvh,860px)] md:max-h-[calc(100dvh-1.5rem)]
            max-h-[88vh]
            flex flex-col gap-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          {/* ── Fixed header ── */}
          <DialogHeader className="shrink-0 border-b border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="text-2xl font-bold text-white">
              Community Settings
            </DialogTitle>
          </DialogHeader>

          {/* ── Scrollable body ── */}
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-5 flex flex-col">
            {initialLoadError ? (
              <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto">
                <p className="text-sm text-red-400">{initialLoadError}</p>
              </div>
            ) : loadingInitialValues || !values ? (
              <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4">
                <Skeleton className="h-10 w-full bg-[#22334f]" />
                <div className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-3">
                  <Skeleton className="h-5 w-40 bg-[#22334f]" />
                  <Skeleton className="h-10 w-full bg-[#1b2a42]" />
                  <Skeleton className="h-24 w-full bg-[#1b2a42]" />
                </div>
              </div>
            ) : (
              /*
                Tabs fills the remaining height.
                Each TabsContent owns its own scroll — none of them rely on a parent scroll.
              */
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as SettingsTab)}
                className="flex-1 min-h-0 flex flex-col gap-0 overflow-hidden"
              >
                {/* Tab strip */}
                <div className="shrink-0 border-b border-[#233753] pb-3">
                  <TabsList className="bg-[#142033] border border-[#304867] w-full flex-wrap justify-start h-auto">
                    {(
                      [
                        "general",
                        "roles",
                        "members",
                        "invites",
                        "bans",
                      ] as SettingsTab[]
                    ).map((tab) => (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="text-[#a9b8cf] data-[state=active]:text-white capitalize"
                      >
                        {tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* Tab panels — each is flex-1 min-h-0 so they fill the remaining space */}
                <div className="mt-4 sm:mt-5 min-h-0 flex-1 overflow-hidden flex flex-col">
                  {/* ════ GENERAL ════
                      Layout: scrollable content + pinned save footer
                  */}
                  <TabsContent
                    value="general"
                    className="flex-1 min-h-0 overflow-hidden flex flex-col gap-0 data-[state=inactive]:hidden"
                  >
                    <GeneralTab
                      values={values}
                      canManageServer={canManageServer}
                      saving={saving}
                      error={error}
                      onValuesChange={setValues}
                      onSave={handleSave}
                    />
                  </TabsContent>

                  {/* ════ ROLES ════
                      Layout: description + errors (shrink), then split panel (flex-1)
                      Left col: create form (shrink) + scrollable role list (flex-1)
                      Right col: scrollable role editor + pinned action footer
                  */}
                  <TabsContent
                    value="roles"
                    className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 data-[state=inactive]:hidden"
                  >
                    <RolesTab
                      roleManagementError={roleManagementError}
                      roleActionError={roleActionError}
                      roleActionSaving={roleActionSaving}
                      roleManagementLoading={roleManagementLoading}
                      newRoleName={newRoleName}
                      newRoleColor={newRoleColor}
                      canManageRoles={canManageRoles}
                      onNewNameChange={setNewRoleName}
                      onNewColorChange={setNewRoleColor}
                      onCreateRole={handleCreateRole}
                      roles={roles}
                      selectedRoleId={selectedRoleId}
                      onSelectRole={setSelectedRoleId}
                      roleDraft={roleDraft}
                      onRoleDraftChange={setRoleDraft}
                      canEditSelectedRoleDetails={canEditSelectedRoleDetails}
                      canEditSelectedRolePermissions={
                        canEditSelectedRolePermissions
                      }
                      canDeleteSelectedRole={canDeleteSelectedRole}
                      visiblePermissionGroups={visiblePermissionGroups}
                      onSaveRole={handleSaveRole}
                      onDeleteRole={handleDeleteRole}
                      toggleDraftPermission={toggleDraftPermission}
                    />
                  </TabsContent>

                  {/* ════ MEMBERS ════
                      Same pattern as Roles: split panel, right col has pinned footer
                  */}
                  <TabsContent
                    value="members"
                    className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 data-[state=inactive]:hidden"
                  >
                    <MembersTab
                      members={members}
                      roles={roles}
                      defaultRoleId={defaultRoleId}
                      onSelectedMemberId={setSelectedMemberId}
                      selectedMemberId={selectedMemberId}
                      memberDraftRoleIds={memberDraftRoleIds}
                      roleManagementLoading={roleManagementLoading}
                      roleManagementError={roleManagementError}
                      memberActionSaving={memberActionSaving}
                      memberActionError={memberActionError}
                      canManageMembers={canManageMembers}
                      canManageRoles={canManageRoles}
                      isOwner={isOwner}
                      onToggleMemberRole={toggleMemberRole}
                      onSaveMemberRoles={handleSaveMemberRoles}
                    />
                  </TabsContent>

                  {/* ════ INVITES ════ — simple scrollable list */}
                  <TabsContent
                    value="invites"
                    className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4 data-[state=inactive]:hidden"
                  >
                    <InvitesTab
                      canManageInvites={canManageInvites}
                      invites={invites}
                      invitesLoading={invitesLoading}
                      invitesError={invitesError}
                      inviteActionError={inviteActionError}
                      inviteBaseUrl={inviteBaseUrl}
                      onCreateInvite={onCreateInvite}
                      onRevokeInvite={onRevokeInvite}
                    />
                  </TabsContent>

                  {/* ════ BANS ════ — simple scrollable list */}
                  <TabsContent
                    value="bans"
                    className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4 data-[state=inactive]:hidden"
                  >
                    <BansTab
                      bans={bans}
                      bansLoading={bansLoading}
                      bansError={bansError}
                      canManageBans={canManageBans}
                      unbanBusyUserId={unbanBusyUserId}
                      unbanActionError={unbanActionError}
                      onUnban={handleUnban}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            )}
          </div>

          {/* ── Fixed footer ── */}
          <DialogFooter className="shrink-0 gap-3 border-t border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
            <Button
              type="button"
              onClick={onClose}
              variant="ghost"
              className="text-white hover:underline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingConfirm)}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === "deleteRole"
                ? "Delete Role?"
                : "Unban User?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingConfirm?.kind === "deleteRole"
                ? `Delete role "${pendingConfirm.roleName}"? This cannot be undone.`
                : pendingConfirm
                  ? `Unban "${pendingConfirm.username}" from this community?`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={Boolean(pendingConfirmBusy)}
              className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(pendingConfirmBusy)}
              onClick={() => {
                void confirmPendingAction();
              }}
            >
              {pendingConfirmBusy
                ? pendingConfirm?.kind === "deleteRole"
                  ? "Deleting..."
                  : "Unbanning..."
                : pendingConfirm?.kind === "deleteRole"
                  ? "Delete Role"
                  : "Unban"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
