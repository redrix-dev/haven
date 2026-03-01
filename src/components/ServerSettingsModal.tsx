import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/shared/lib/errors';
import type {
  CommunityBanItem,
  PermissionCatalogItem,
  ServerMemberRoleItem,
  ServerRoleItem,
} from '@/lib/backend/types';
import { Database } from '@/types/database';

type DeveloperAccessMode = Database['public']['Enums']['developer_access_mode'];
type SettingsTab = 'general' | 'roles' | 'members' | 'invites' | 'bans';

type RoleDraft = {
  name: string;
  color: string;
  position: number;
  permissionKeys: string[];
};
type ServerSettingsConfirmState =
  | { kind: 'deleteRole'; roleId: string; roleName: string }
  | { kind: 'unbanUser'; targetUserId: string; username: string };

export interface ServerSettingsValues {
  name: string;
  description: string | null;
  allowPublicInvites: boolean;
  requireReportReason: boolean;
  developerAccessEnabled: boolean;
  developerAccessMode: DeveloperAccessMode;
  developerAccessChannelIds: string[];
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
  channels: Array<{ id: string; name: string }>;
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
  canManageDeveloperAccess: boolean;
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
  onCreateRole: (values: { name: string; color: string; position: number }) => Promise<void>;
  onUpdateRole: (values: {
    roleId: string;
    name: string;
    color: string;
    position: number;
  }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSaveRolePermissions: (roleId: string, permissionKeys: string[]) => Promise<void>;
  onSaveMemberRoles: (memberId: string, roleIds: string[]) => Promise<void>;
  onCreateInvite: (values: {
    maxUses: number | null;
    expiresInHours: number | null;
  }) => Promise<ServerInviteItem>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onUnbanUser: (values: { targetUserId: string; reason?: string | null }) => Promise<void>;
}

const toTitleCaseWords = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export function ServerSettingsModal({
  channels,
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
  canManageDeveloperAccess,
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [values, setValues] = useState<ServerSettingsValues | null>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#7289da');
  const [roleActionSaving, setRoleActionSaving] = useState(false);
  const [roleActionError, setRoleActionError] = useState<string | null>(null);

  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDraftRoleIds, setMemberDraftRoleIds] = useState<string[]>([]);
  const [memberActionSaving, setMemberActionSaving] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);

  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteMaxUsesInput, setInviteMaxUsesInput] = useState('');
  const [inviteExpiryHoursInput, setInviteExpiryHoursInput] = useState('1');
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [unbanActionError, setUnbanActionError] = useState<string | null>(null);
  const [unbanBusyUserId, setUnbanBusyUserId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<ServerSettingsConfirmState | null>(null);

  useEffect(() => {
    setValues(initialValues);
    setError(null);
  }, [initialValues]);

  useEffect(() => {
    if (selectedRoleId && roles.some((role) => role.id === selectedRoleId)) return;
    setSelectedRoleId(roles[0]?.id ?? null);
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
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
    if (selectedMemberId && members.some((member) => member.memberId === selectedMemberId)) return;
    setSelectedMemberId(members[0]?.memberId ?? null);
  }, [members, selectedMemberId]);

  const selectedMember = useMemo(
    () => members.find((member) => member.memberId === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  useEffect(() => {
    if (!selectedMember) {
      setMemberDraftRoleIds([]);
      return;
    }

    setMemberDraftRoleIds(selectedMember.roleIds);
    setMemberActionError(null);
  }, [selectedMember]);

  const canShowChannelScopes = useMemo(
    () =>
      Boolean(
        values &&
          values.developerAccessEnabled &&
          values.developerAccessMode === 'channel_scoped' &&
          canManageDeveloperAccess
      ),
    [values, canManageDeveloperAccess]
  );

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => member.displayName.toLowerCase().includes(query));
  }, [members, memberSearch]);

  const defaultRoleId = useMemo(
    () => roles.find((role) => role.isDefault)?.id ?? null,
    [roles]
  );

  const canEditSelectedRoleDetails =
    Boolean(selectedRole) &&
    canManageRoles &&
    (!selectedRole?.isSystem || isOwner) &&
    !selectedRole?.isDefault;

  const canEditSelectedRolePermissions =
    Boolean(selectedRole) && canManageRoles && (!selectedRole?.isSystem || isOwner);

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
      setTimeout(() => setCopiedInviteId((current) => (current === inviteId ? null : current)), 1200);
    } catch {
      setInviteActionError('Failed to copy invite link to clipboard.');
    }
  };

  const toggleScopedChannel = (channelId: string) => {
    if (!values) return;
    const hasChannel = values.developerAccessChannelIds.includes(channelId);
    const nextChannelIds = hasChannel
      ? values.developerAccessChannelIds.filter((id) => id !== channelId)
      : [...values.developerAccessChannelIds, channelId];

    setValues({
      ...values,
      developerAccessChannelIds: nextChannelIds,
    });
  };

  const handleSave = async () => {
    if (!values) return;
    if (!values.name.trim()) {
      setError('Server name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save server settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!canManageRoles) return;
    const trimmedName = newRoleName.trim();
    if (!trimmedName) {
      setRoleActionError('Role name is required.');
      return;
    }

    const nextPosition = roles.length === 0 ? 1 : Math.max(...roles.map((role) => role.position)) + 1;
    setRoleActionSaving(true);
    setRoleActionError(null);
    try {
      await onCreateRole({
        name: trimmedName,
        color: newRoleColor,
        position: nextPosition,
      });
      setNewRoleName('');
    } catch (err: unknown) {
      setRoleActionError(getErrorMessage(err, 'Failed to create role.'));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const toggleDraftPermission = (permissionKey: string) => {
    if (!roleDraft) return;
    const hasPermission = roleDraft.permissionKeys.includes(permissionKey);
    const nextPermissionKeys = hasPermission
      ? roleDraft.permissionKeys.filter((key) => key !== permissionKey)
      : [...roleDraft.permissionKeys, permissionKey];
    setRoleDraft({ ...roleDraft, permissionKeys: nextPermissionKeys });
  };

  const handleSaveRole = async () => {
    if (!selectedRoleId || !roleDraft) return;
    const trimmedName = roleDraft.name.trim();
    if (!trimmedName) {
      setRoleActionError('Role name is required.');
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
      setRoleActionError(getErrorMessage(err, 'Failed to save role changes.'));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const handleDeleteRole = () => {
    if (!selectedRoleId || !selectedRole) return;
    setPendingConfirm({
      kind: 'deleteRole',
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
      setRoleActionError(getErrorMessage(err, 'Failed to delete role.'));
    } finally {
      setRoleActionSaving(false);
    }
  };

  const toggleMemberRole = (roleId: string) => {
    setMemberDraftRoleIds((currentRoleIds) =>
      currentRoleIds.includes(roleId)
        ? currentRoleIds.filter((id) => id !== roleId)
        : [...currentRoleIds, roleId]
    );
  };

  const handleSaveMemberRoles = async () => {
    if (!selectedMemberId) return;
    const nextRoleIds = Array.from(new Set([...memberDraftRoleIds, ...(defaultRoleId ? [defaultRoleId] : [])]));

    setMemberActionSaving(true);
    setMemberActionError(null);
    try {
      await onSaveMemberRoles(selectedMemberId, nextRoleIds);
    } catch (err: unknown) {
      setMemberActionError(getErrorMessage(err, 'Failed to save member roles.'));
    } finally {
      setMemberActionSaving(false);
    }
  };

  const handleCreateInvite = async () => {
    const maxUses = parsePositiveIntegerOrNull(inviteMaxUsesInput);
    const parsedExpiresInHours = parsePositiveIntegerOrNull(inviteExpiryHoursInput);
    const expiresInHours = parsedExpiresInHours ?? 1;

    if (inviteMaxUsesInput.trim() && maxUses === null) {
      setInviteActionError('Max uses must be a whole number greater than 0.');
      return;
    }

    if (inviteExpiryHoursInput.trim() && parsedExpiresInHours === null) {
      setInviteActionError('Expiration must be a whole number greater than 0.');
      return;
    }

    setInviteCreating(true);
    setInviteActionError(null);
    try {
      const invite = await onCreateInvite({
        maxUses,
        expiresInHours,
      });
      await copyInviteLink(invite.code, invite.id);
    } catch (err: unknown) {
      setInviteActionError(getErrorMessage(err, 'Failed to create invite link.'));
    } finally {
      setInviteCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setInviteActionError(null);
    try {
      await onRevokeInvite(inviteId);
    } catch (err: unknown) {
      setInviteActionError(getErrorMessage(err, 'Failed to revoke invite link.'));
    }
  };

  const handleUnban = (values: { targetUserId: string; username: string }) => {
    if (!canManageBans) return;
    setPendingConfirm({
      kind: 'unbanUser',
      targetUserId: values.targetUserId,
      username: values.username,
    });
  };

  const confirmUnban = async (targetUserId: string) => {
    setUnbanActionError(null);
    setUnbanBusyUserId(targetUserId);
    try {
      await onUnbanUser({
        targetUserId,
        reason: null,
      });
    } catch (err: unknown) {
      setUnbanActionError(getErrorMessage(err, 'Failed to unban user.'));
    } finally {
      setUnbanBusyUserId(null);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirm) return;
    const nextConfirm = pendingConfirm;
    setPendingConfirm(null);

    if (nextConfirm.kind === 'deleteRole') {
      await confirmDeleteRole(nextConfirm.roleId);
      return;
    }

    await confirmUnban(nextConfirm.targetUserId);
  };

  const pendingConfirmBusy =
    pendingConfirm?.kind === 'deleteRole'
      ? roleActionSaving
      : pendingConfirm?.kind === 'unbanUser' && unbanBusyUserId === pendingConfirm.targetUserId;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          size="app"
          className="bg-[#18243a] border-[#142033] text-white overflow-hidden"
          showCloseButton={false}
        >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Server Settings</DialogTitle>
        </DialogHeader>

        {initialLoadError ? (
          <div className="space-y-4">
            <p className="text-sm text-red-400">{initialLoadError}</p>
          </div>
        ) : loadingInitialValues || !values ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full bg-[#22334f]" />
            <div className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-3">
              <Skeleton className="h-5 w-40 bg-[#22334f]" />
              <Skeleton className="h-10 w-full bg-[#1b2a42]" />
              <Skeleton className="h-24 w-full bg-[#1b2a42]" />
            </div>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(nextValue) => setActiveTab(nextValue as SettingsTab)}
            className="flex-1 min-h-0 flex flex-col"
          >
            <TabsList className="bg-[#142033] border border-[#304867] w-full flex-wrap justify-start h-auto">
              <TabsTrigger value="general" className="text-[#a9b8cf] data-[state=active]:text-white">
                General
              </TabsTrigger>
              <TabsTrigger value="roles" className="text-[#a9b8cf] data-[state=active]:text-white">
                Roles
              </TabsTrigger>
              <TabsTrigger value="members" className="text-[#a9b8cf] data-[state=active]:text-white">
                Members
              </TabsTrigger>
              <TabsTrigger value="invites" className="text-[#a9b8cf] data-[state=active]:text-white">
                Invites
              </TabsTrigger>
              <TabsTrigger value="bans" className="text-[#a9b8cf] data-[state=active]:text-white">
                Bans
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 min-h-0 flex-1 overflow-hidden flex flex-col">
              <TabsContent value="general" className="min-h-0 overflow-hidden pr-1 flex flex-col gap-4">
                <div className="scrollbar-inset min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <section className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-4">
                      <h3 className="text-white font-semibold">General</h3>

                      <div className="space-y-2">
                        <Label htmlFor="server-settings-name" className="text-xs font-semibold uppercase text-[#a9b8cf]">
                          Server Name
                        </Label>
                        <Input
                          id="server-settings-name"
                          value={values.name}
                          onChange={(e) => setValues({ ...values, name: e.target.value })}
                          className="bg-[#142033] border-[#304867] text-white"
                          maxLength={100}
                          required
                          disabled={!canManageServer}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="server-settings-description" className="text-xs font-semibold uppercase text-[#a9b8cf]">
                          Description
                        </Label>
                        <Textarea
                          id="server-settings-description"
                          value={values.description ?? ''}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              description: e.target.value,
                            })
                          }
                          className="min-h-24 bg-[#142033] border-[#304867] text-white"
                          maxLength={500}
                          placeholder="Tell people what this server is about."
                          disabled={!canManageServer}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
                        <Label htmlFor="allow-public-invites" className="text-sm text-[#e6edf7]">
                          Allow public invites
                        </Label>
                        <Switch
                          id="allow-public-invites"
                          checked={values.allowPublicInvites}
                          onCheckedChange={(checked) =>
                            setValues({
                              ...values,
                              allowPublicInvites: checked,
                            })
                          }
                          disabled={!canManageServer}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
                        <Label htmlFor="require-report-reason" className="text-sm text-[#e6edf7]">
                          Require a reason when submitting support reports
                        </Label>
                        <Switch
                          id="require-report-reason"
                          checked={values.requireReportReason}
                          onCheckedChange={(checked) =>
                            setValues({
                              ...values,
                              requireReportReason: checked,
                            })
                          }
                          disabled={!canManageServer}
                        />
                      </div>

                      {!canManageServer && (
                        <p className="text-xs text-[#d6a24a]">
                          You can view these settings, but only members with Manage Server can edit them.
                        </p>
                      )}
                    </section>

                    <section className="rounded-md border border-[#304867] bg-[#142033] p-4 space-y-4">
                      <h3 className="text-white font-semibold">Haven Developer Access</h3>

                      <p className="text-sm text-[#a9b8cf]">
                        Configure whether Haven developers can send official messages inside this server.
                      </p>

                      <div className="flex items-center justify-between gap-3 rounded-md bg-[#111a2b] px-3 py-2">
                        <Label htmlFor="developer-access-enabled" className="text-sm text-[#e6edf7]">
                          Enable Haven developer access
                        </Label>
                        <Switch
                          id="developer-access-enabled"
                          checked={values.developerAccessEnabled}
                          onCheckedChange={(checked) =>
                            setValues({
                              ...values,
                              developerAccessEnabled: checked,
                            })
                          }
                          disabled={!canManageDeveloperAccess}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Access Mode</Label>
                        <Select
                          value={values.developerAccessMode}
                          onValueChange={(value) =>
                            setValues({
                              ...values,
                              developerAccessMode: value as DeveloperAccessMode,
                            })
                          }
                          disabled={!canManageDeveloperAccess || !values.developerAccessEnabled}
                        >
                          <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                            <SelectValue placeholder="Select access mode" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#142033] border-[#304867] text-white">
                            <SelectItem value="report_only">Report Only</SelectItem>
                            <SelectItem value="channel_scoped">Channel Scoped</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {canShowChannelScopes && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-[#a9b8cf]">Allowed Channels</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {channels.map((channel) => (
                              <div
                                key={channel.id}
                                className="flex items-center gap-3 text-sm text-[#e6edf7] bg-[#111a2b] rounded-md p-2"
                              >
                                <Checkbox
                                  id={`dev-channel-${channel.id}`}
                                  checked={values.developerAccessChannelIds.includes(channel.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked === true || checked === false) {
                                      toggleScopedChannel(channel.id);
                                    }
                                  }}
                                />
                                <Label htmlFor={`dev-channel-${channel.id}`}>#{channel.name}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!canManageDeveloperAccess && (
                        <p className="text-xs text-[#d6a24a]">
                          You can view this section, but only members with Manage Developer Access can change
                          it.
                        </p>
                      )}
                    </section>
                  </div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-[#233753] pt-3">
                  {error && <p className="text-sm text-red-400">{error}</p>}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={saving || !canManageServer}
                      className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                      onClick={() => void handleSave()}
                    >
                      {saving ? 'Saving...' : 'Save General Settings'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="roles" className="min-h-0 overflow-hidden pr-1 flex flex-col gap-4">
                <p className="text-sm text-[#a9b8cf]">
                  Roles define what people can do server-wide. The database enforces permissions using
                  role assignments and role permission entries.
                </p>
                {roleManagementError && <p className="text-sm text-red-400">{roleManagementError}</p>}
                {roleActionError && <p className="text-sm text-red-400">{roleActionError}</p>}

                {roleManagementLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3"
                      >
                        <Skeleton className="h-4 w-32 bg-[#22334f]" />
                        <Skeleton className="h-10 w-full bg-[#1b2a42]" />
                        <Skeleton className="h-10 w-full bg-[#1b2a42]" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
                    <div className="space-y-3 min-h-0 flex flex-col">
                      <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Create Role</p>
                        <Input
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          placeholder="Role name"
                          className="bg-[#101a2b] border-[#304867] text-white"
                          disabled={!canManageRoles || roleActionSaving}
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={newRoleColor}
                            onChange={(e) => setNewRoleColor(e.target.value)}
                            className="h-9 w-14 p-1 bg-[#101a2b] border-[#304867]"
                            disabled={!canManageRoles || roleActionSaving}
                          />
                          <Button
                            type="button"
                            onClick={() => void handleCreateRole()}
                            disabled={!canManageRoles || roleActionSaving}
                            className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                          >
                            {roleActionSaving ? 'Creating...' : 'Create'}
                          </Button>
                        </div>
                        {!canManageRoles && (
                          <p className="text-xs text-[#d6a24a]">
                            You need Manage Roles to create or edit roles.
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border border-[#304867] bg-[#142033] min-h-0 flex-1 overflow-hidden">
                        <div className="scrollbar-inset h-full min-h-0 overflow-y-auto p-2 space-y-1">
                          {roles.length === 0 ? (
                            <p className="text-sm text-[#a9b8cf] px-2 py-3">No roles found.</p>
                          ) : (
                            roles.map((role) => {
                              const isSelected = role.id === selectedRoleId;
                              return (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() => setSelectedRoleId(role.id)}
                                  className={`w-full text-left rounded-md px-2 py-2 border transition-colors ${
                                    isSelected
                                      ? 'border-[#3f79d8] bg-[#1a2a43]'
                                      : 'border-transparent hover:border-[#304867] hover:bg-[#17263d]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="inline-block size-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: role.color }}
                                        aria-hidden
                                      />
                                      <span className="text-sm font-medium text-white truncate">
                                        {role.name}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-[#8ea4c7]">{role.position}</span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#304867] bg-[#142033] min-h-0 flex flex-col overflow-hidden">
                      {!selectedRole || !roleDraft ? (
                        <p className="p-4 text-sm text-[#a9b8cf]">Select a role to edit its permissions.</p>
                      ) : (
                        <div className="p-4 min-h-0 flex flex-col gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-white">{selectedRole.name}</p>
                            {selectedRole.isDefault && <Badge variant="outline">Default</Badge>}
                            {selectedRole.isSystem && <Badge variant="outline">System</Badge>}
                            <Badge variant="outline">{selectedRole.memberCount} members</Badge>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Role Name</Label>
                              <Input
                                value={roleDraft.name}
                                onChange={(e) =>
                                  setRoleDraft({
                                    ...roleDraft,
                                    name: e.target.value,
                                  })
                                }
                                className="bg-[#101a2b] border-[#304867] text-white"
                                disabled={!canEditSelectedRoleDetails || roleActionSaving}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Color</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={roleDraft.color}
                                  onChange={(e) =>
                                    setRoleDraft({
                                      ...roleDraft,
                                      color: e.target.value,
                                    })
                                  }
                                  className="h-9 w-14 p-1 bg-[#101a2b] border-[#304867]"
                                  disabled={!canEditSelectedRoleDetails || roleActionSaving}
                                />
                                <Input
                                  value={roleDraft.color}
                                  onChange={(e) =>
                                    setRoleDraft({
                                      ...roleDraft,
                                      color: e.target.value,
                                    })
                                  }
                                  className="bg-[#101a2b] border-[#304867] text-white"
                                  disabled={!canEditSelectedRoleDetails || roleActionSaving}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Tier</Label>
                              <Input
                                type="number"
                                value={roleDraft.position}
                                onChange={(e) =>
                                  setRoleDraft({
                                    ...roleDraft,
                                    position: Number(e.target.value),
                                  })
                                }
                                className="bg-[#101a2b] border-[#304867] text-white"
                                disabled={!canEditSelectedRoleDetails || roleActionSaving}
                              />
                            </div>
                          </div>

                          <div className="space-y-2 min-h-0 flex-1 flex flex-col">
                            <p className="text-xs font-semibold uppercase text-[#a9b8cf]">Permissions</p>
                            <div className="min-h-0 flex-1 rounded-md border border-[#304867] overflow-hidden">
                              <div className="scrollbar-inset h-full min-h-0 overflow-y-auto divide-y divide-[#233753]">
                                {permissionsCatalog.map((permission) => {
                                  const checked = roleDraft.permissionKeys.includes(permission.key);
                                  return (
                                    <label
                                      key={permission.key}
                                      className="flex items-start gap-3 p-3 text-sm text-[#e6edf7]"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={() => toggleDraftPermission(permission.key)}
                                        disabled={!canEditSelectedRolePermissions || roleActionSaving}
                                      />
                                      <span className="space-y-1">
                                        <span className="block font-medium text-white">
                                          {toTitleCaseWords(permission.key)}
                                        </span>
                                        <span className="block text-xs text-[#a9b8cf]">
                                          {permission.description}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => void handleDeleteRole()}
                              disabled={!canDeleteSelectedRole || roleActionSaving}
                              className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                            >
                              Delete Role
                            </Button>

                            <Button
                              type="button"
                              onClick={() => void handleSaveRole()}
                              disabled={roleActionSaving || !canEditSelectedRolePermissions}
                              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                            >
                              {roleActionSaving ? 'Saving...' : 'Save Role'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members" className="min-h-0 overflow-hidden pr-1 flex flex-col gap-4">
                <p className="text-sm text-[#a9b8cf]">
                  Assign roles to members. Role assignments are stored in the database and enforced by
                  role-based permission checks.
                </p>
                {roleManagementError && <p className="text-sm text-red-400">{roleManagementError}</p>}
                {memberActionError && <p className="text-sm text-red-400">{memberActionError}</p>}

                {roleManagementLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full bg-[#22334f]" />
                    {Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32 bg-[#22334f]" />
                            <Skeleton className="h-3 w-24 bg-[#1b2a42]" />
                          </div>
                          <Skeleton className="h-8 w-24 bg-[#22334f]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
                    <div className="space-y-3 min-h-0 flex flex-col">
                      <Input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search server members..."
                        className="bg-[#142033] border-[#304867] text-white"
                      />

                      <div className="rounded-md border border-[#304867] bg-[#142033] min-h-0 flex-1 overflow-hidden">
                        <div className="scrollbar-inset h-full min-h-0 overflow-y-auto p-2 space-y-1">
                          {filteredMembers.length === 0 ? (
                            <p className="text-sm text-[#a9b8cf] px-2 py-3">No matching members.</p>
                          ) : (
                            filteredMembers.map((member) => {
                              const isSelected = member.memberId === selectedMemberId;
                              return (
                                <button
                                  key={member.memberId}
                                  type="button"
                                  onClick={() => setSelectedMemberId(member.memberId)}
                                  className={`w-full text-left rounded-md px-2 py-2 border transition-colors ${
                                    isSelected
                                      ? 'border-[#3f79d8] bg-[#1a2a43]'
                                      : 'border-transparent hover:border-[#304867] hover:bg-[#17263d]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-white truncate">{member.displayName}</p>
                                      <p className="text-[11px] text-[#8ea4c7] truncate">{member.userId}</p>
                                    </div>
                                    {member.isOwner && <Badge variant="outline">Owner</Badge>}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#304867] bg-[#142033] min-h-0 flex flex-col overflow-hidden">
                      {!selectedMember ? (
                        <p className="p-4 text-sm text-[#a9b8cf]">Select a member to assign roles.</p>
                      ) : (
                        <div className="p-4 min-h-0 flex flex-col gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{selectedMember.displayName}</p>
                            <p className="text-xs text-[#8ea4c7] mt-1">{selectedMember.userId}</p>
                          </div>

                          {selectedMember.isOwner ? (
                            <p className="text-xs text-[#d6a24a]">
                              Owner membership is fixed and cannot be changed here.
                            </p>
                          ) : !canManageRoles ? (
                            <p className="text-xs text-[#d6a24a]">
                              You need Manage Roles to change member role assignments.
                            </p>
                          ) : canManageMembers ? null : (
                            <p className="text-xs text-[#8ea4c7]">
                              Manage Members is available, but role assignment is controlled by Manage Roles.
                            </p>
                          )}

                          <div className="min-h-0 flex-1 rounded-md border border-[#304867] overflow-hidden">
                            <div className="scrollbar-inset h-full min-h-0 overflow-y-auto divide-y divide-[#233753]">
                              {roles.map((role) => {
                                const checked =
                                  memberDraftRoleIds.includes(role.id) || (defaultRoleId !== null && role.id === defaultRoleId);

                                const disabled =
                                  !canManageRoles ||
                                  selectedMember.isOwner ||
                                  role.id === defaultRoleId ||
                                  (role.isSystem && !isOwner);

                                return (
                                  <label
                                    key={role.id}
                                    className="flex items-center justify-between gap-3 p-3 text-sm text-[#e6edf7]"
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="inline-block size-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: role.color }}
                                        aria-hidden
                                      />
                                      <span className="truncate text-white">{role.name}</span>
                                      {role.isDefault && <Badge variant="outline">Default</Badge>}
                                      {role.isSystem && <Badge variant="outline">System</Badge>}
                                    </span>
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleMemberRole(role.id)}
                                      disabled={disabled || memberActionSaving}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              onClick={() => void handleSaveMemberRoles()}
                              disabled={!canManageRoles || selectedMember.isOwner || memberActionSaving}
                              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                            >
                              {memberActionSaving ? 'Saving...' : 'Save Member Roles'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="invites" className="scrollbar-inset min-h-0 overflow-y-auto pr-1 space-y-4">
                <h3 className="text-white font-semibold">Invite Links</h3>

                <p className="text-sm text-[#a9b8cf]">
                  Create and share invite links for this server.
                </p>

                {canManageInvites ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input
                        value={inviteMaxUsesInput}
                        onChange={(e) => setInviteMaxUsesInput(e.target.value)}
                        placeholder="Max uses (blank = unlimited)"
                        className="bg-[#142033] border-[#304867] text-white"
                      />
                      <Input
                        value={inviteExpiryHoursInput}
                        onChange={(e) => setInviteExpiryHoursInput(e.target.value)}
                        placeholder="Expires in hours (blank = 1 hour)"
                        className="bg-[#142033] border-[#304867] text-white"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleCreateInvite()}
                        disabled={inviteCreating}
                        className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                      >
                        {inviteCreating ? 'Creating...' : 'Create Invite'}
                      </Button>
                    </div>
                    <p className="text-xs text-[#8ea4c7]">
                      Invite expiry defaults to 1 hour unless you enter a different value.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[#d6a24a]">
                    You can view active invites, but only members with Manage Invites can create or
                    revoke them.
                  </p>
                )}

                {inviteActionError && <p className="text-sm text-red-400">{inviteActionError}</p>}
                {invitesError && <p className="text-sm text-red-400">{invitesError}</p>}

                {invitesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md bg-[#142033] p-3 space-y-2"
                      >
                        <Skeleton className="h-4 w-full bg-[#22334f]" />
                        <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
                      </div>
                    ))}
                  </div>
                ) : invites.length === 0 ? (
                  <p className="text-sm text-[#a9b8cf]">No active invites.</p>
                ) : (
                  <div className="space-y-2">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="bg-[#142033] rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-white font-semibold text-sm break-all">
                            {`${inviteBaseUrl}${invite.code}`}
                          </p>
                          <p className="text-xs text-[#a9b8cf] mt-1">
                            Uses: {invite.currentUses}
                            {invite.maxUses ? ` / ${invite.maxUses}` : ' / unlimited'}
                            {' | '}
                            Expires:{' '}
                            {invite.expiresAt
                              ? new Date(invite.expiresAt).toLocaleString()
                              : 'never'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void copyInviteLink(invite.code, invite.id)}
                            className="text-white hover:bg-[#22334f]"
                          >
                            {copiedInviteId === invite.id ? 'Copied' : 'Copy'}
                          </Button>
                          {canManageInvites && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => void handleRevokeInvite(invite.id)}
                              className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bans" className="scrollbar-inset min-h-0 overflow-y-auto pr-1 space-y-4">
                <h3 className="text-white font-semibold">Banned Users</h3>

                <p className="text-sm text-[#a9b8cf]">
                  Active bans for this server. Each entry includes who was banned, when, and the ban description.
                </p>

                {!canManageBans && (
                  <p className="text-xs text-[#d6a24a]">
                    You can view bans, but only members with Manage Bans can unban users.
                  </p>
                )}

                {bansError && <p className="text-sm text-red-400">{bansError}</p>}
                {unbanActionError && <p className="text-sm text-red-400">{unbanActionError}</p>}

                {bansLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3 space-y-2"
                      >
                        <Skeleton className="h-4 w-28 bg-[#22334f]" />
                        <Skeleton className="h-3 w-40 bg-[#1b2a42]" />
                        <Skeleton className="h-8 w-20 bg-[#22334f]" />
                      </div>
                    ))}
                  </div>
                ) : bans.length === 0 ? (
                  <p className="text-sm text-[#a9b8cf]">No active bans.</p>
                ) : (
                  <div className="space-y-2">
                    {bans.map((ban) => (
                      <div
                        key={ban.id}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3 flex flex-col gap-2"
                      >
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-semibold text-white">{ban.username}</p>
                          <p className="text-[11px] text-[#8ea4c7]">
                            Banned on {new Date(ban.bannedAt).toLocaleString()}
                          </p>
                        </div>
                        <p className="text-sm text-[#d4def0] whitespace-pre-wrap">
                          {ban.reason}
                        </p>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void handleUnban({
                              targetUserId: ban.bannedUserId,
                              username: ban.username,
                            })}
                            disabled={!canManageBans || unbanBusyUserId === ban.bannedUserId}
                            className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                          >
                            {unbanBusyUserId === ban.bannedUserId ? 'Unbanning...' : 'Unban'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-3">
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
          if (!open) {
            setPendingConfirm(null);
          }
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === 'deleteRole' ? 'Delete Role?' : 'Unban User?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingConfirm?.kind === 'deleteRole'
                ? `Delete role "${pendingConfirm.roleName}"? This cannot be undone.`
                : pendingConfirm
                  ? `Unban "${pendingConfirm.username}" from this server?`
                  : ''}
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
                ? pendingConfirm?.kind === 'deleteRole'
                  ? 'Deleting...'
                  : 'Unbanning...'
                : pendingConfirm?.kind === 'deleteRole'
                  ? 'Delete Role'
                  : 'Unban'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
