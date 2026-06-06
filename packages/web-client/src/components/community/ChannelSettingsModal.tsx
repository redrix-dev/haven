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
} from '@shared/app/ui/alert-dialog';
import { Button } from '@shared/app/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/app/ui/dialog';
import { Input } from '@shared/app/ui/input';
import { Label } from '@shared/app/ui/label';
import { Skeleton } from '@shared/app/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/app/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/app/ui/tabs';
import { getErrorMessage } from '@platform/lib/errors';

export type PermissionValue = boolean | null;

export interface ChannelPermissionState {
  canView: PermissionValue;
  canSend: PermissionValue;
  canManage: PermissionValue;
}

export interface ChannelRolePermissionItem extends ChannelPermissionState {
  roleId: string;
  name: string;
  color: string;
  isDefault: boolean;
  editable: boolean;
  defaultCanView: boolean;
  defaultCanSend: boolean;
  defaultCanManage: boolean;
}

export interface ChannelMemberPermissionItem extends ChannelPermissionState {
  memberId: string;
  displayName: string;
  isOwner: boolean;
}

export interface ChannelMemberOption {
  memberId: string;
  displayName: string;
  isOwner: boolean;
}

interface ChannelSettingsModalProps {
  initialName: string;
  initialTopic: string | null;
  canDelete: boolean;
  canManageChannelStructure: boolean;
  canManageChannelPermissions: boolean;
  rolePermissions: ChannelRolePermissionItem[];
  memberPermissions: ChannelMemberPermissionItem[];
  availableMembers: ChannelMemberOption[];
  permissionsLoading: boolean;
  permissionsLoadError: string | null;
  onClose: () => void;
  onSave: (values: { name: string; topic: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
  onSaveRolePermissions: (
    roleId: string,
    permissions: ChannelPermissionState
  ) => Promise<void>;
  onSaveMemberPermissions: (
    memberId: string,
    permissions: ChannelPermissionState
  ) => Promise<void>;
}

type PermissionKey = 'canView' | 'canSend';
type PermissionSelectValue = 'default' | 'allow' | 'deny';

type TabKey = 'general' | 'permissions';

const PERMISSION_COLUMNS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'canView', label: 'Can view this channel' },
  { key: 'canSend', label: 'Can send messages' },
];

const permissionValueToSelectValue = (value: PermissionValue): PermissionSelectValue => {
  if (value === true) return 'allow';
  if (value === false) return 'deny';
  return 'default';
};

const permissionSelectValueToPermissionValue = (value: PermissionSelectValue): PermissionValue => {
  if (value === 'allow') return true;
  if (value === 'deny') return false;
  return null;
};

const roleDefaultSelectLabel = (defaultValue: boolean): string =>
  `Community Default [${defaultValue ? 'Yes' : 'No'}]`;

const memberDefaultSelectLabel = (): string => 'Community Default';

const rolePermissionDefaultValueForKey = (
  row: ChannelRolePermissionItem,
  key: PermissionKey
): boolean => {
  switch (key) {
    case 'canView':
      return row.defaultCanView;
    case 'canSend':
      return row.defaultCanSend;
    default:
      return false;
  }
};

export function ChannelSettingsModal({
  initialName,
  initialTopic,
  canDelete,
  canManageChannelStructure,
  canManageChannelPermissions,
  rolePermissions,
  memberPermissions,
  availableMembers,
  permissionsLoading,
  permissionsLoadError,
  onClose,
  onSave,
  onDelete,
  onSaveRolePermissions,
  onSaveMemberPermissions,
}: ChannelSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(
    canManageChannelStructure ? 'general' : 'permissions'
  );
  const [name, setName] = useState(initialName);
  const [topic, setTopic] = useState(initialTopic ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [roleRows, setRoleRows] = useState<ChannelRolePermissionItem[]>(rolePermissions);
  const [memberRows, setMemberRows] = useState<ChannelMemberPermissionItem[]>(memberPermissions);
  const [permissionSavingKey, setPermissionSavingKey] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [addMemberId, setAddMemberId] = useState('');

  useEffect(() => {
    setName(initialName);
    setTopic(initialTopic ?? '');
    setGeneralError(null);
  }, [initialName, initialTopic]);

  useEffect(() => {
    setRoleRows(rolePermissions);
  }, [rolePermissions]);

  useEffect(() => {
    setMemberRows(memberPermissions);
  }, [memberPermissions]);

  useEffect(() => {
    if (!canManageChannelStructure && !canManageChannelPermissions) {
      return;
    }

    if (activeTab === 'general' && !canManageChannelStructure && canManageChannelPermissions) {
      setActiveTab('permissions');
      return;
    }

    if (activeTab === 'permissions' && !canManageChannelPermissions && canManageChannelStructure) {
      setActiveTab('general');
    }
  }, [activeTab, canManageChannelPermissions, canManageChannelStructure]);

  const visibleRoleRows = useMemo(
    () => roleRows.filter((roleRow) => roleRow.name.trim().toLowerCase() !== 'owner'),
    [roleRows]
  );

  const visibleMemberRows = useMemo(
    () => memberRows.filter((memberRow) => !memberRow.isOwner),
    [memberRows]
  );

  const hasPermissionRows = useMemo(
    () => visibleRoleRows.length > 0 || visibleMemberRows.length > 0,
    [visibleRoleRows.length, visibleMemberRows.length]
  );

  const availableMembersForAdd = useMemo(() => {
    const existingMemberIds = new Set(visibleMemberRows.map((memberRow) => memberRow.memberId));
    return availableMembers.filter(
      (member) => !member.isOwner && !existingMemberIds.has(member.memberId)
    );
  }, [availableMembers, visibleMemberRows]);

  const filteredMemberRows = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return visibleMemberRows;
    return visibleMemberRows.filter((memberRow) =>
      memberRow.displayName.toLowerCase().includes(query)
    );
  }, [visibleMemberRows, memberSearch]);

  useEffect(() => {
    if (availableMembersForAdd.length === 0) {
      setAddMemberId('');
      return;
    }

    if (!availableMembersForAdd.some((member) => member.memberId === addMemberId)) {
      setAddMemberId(availableMembersForAdd[0].memberId);
    }
  }, [availableMembersForAdd, addMemberId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageChannelStructure) return;
    if (!name.trim()) {
      setGeneralError('Channel name is required.');
      return;
    }

    setSaving(true);
    setGeneralError(null);
    try {
      await onSave({
        name: name.trim(),
        topic: topic.trim() ? topic.trim() : null,
      });
      onClose();
    } catch (err: unknown) {
      setGeneralError(getErrorMessage(err, 'Failed to save channel settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canManageChannelStructure) return;
    setDeleting(true);
    setGeneralError(null);
    try {
      await onDelete();
      onClose();
    } catch (err: unknown) {
      setGeneralError(getErrorMessage(err, 'Failed to delete channel.'));
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const handleAddMemberOverwrite = () => {
    if (!canManageChannelPermissions) return;
    if (!addMemberId) return;

    const member = availableMembersForAdd.find((item) => item.memberId === addMemberId);
    if (!member) return;

    setMemberRows((prev) => [
      ...prev,
      {
        memberId: member.memberId,
        displayName: member.displayName,
        isOwner: member.isOwner,
        canView: null,
        canSend: null,
        canManage: null,
      },
    ]);
    setPermissionError(null);
  };

  const handleRolePermissionSet = async (
    roleId: string,
    key: PermissionKey,
    nextValue: PermissionValue
  ) => {
    if (!canManageChannelPermissions) return;
    const row = roleRows.find((roleRow) => roleRow.roleId === roleId);
    if (!row || !row.editable) return;

    const previousRow = row;
    const nextRow: ChannelRolePermissionItem = {
      ...row,
      [key]: nextValue,
    };

    setRoleRows((prev) =>
      prev.map((roleRow) => (roleRow.roleId === roleId ? nextRow : roleRow))
    );

    setPermissionError(null);
    setPermissionSavingKey(`role:${roleId}:${key}`);

    try {
      await onSaveRolePermissions(roleId, {
        canView: nextRow.canView,
        canSend: nextRow.canSend,
        canManage: nextRow.canManage,
      });
    } catch (err: unknown) {
      setRoleRows((prev) =>
        prev.map((roleRow) => (roleRow.roleId === roleId ? previousRow : roleRow))
      );
      setPermissionError(getErrorMessage(err, 'Failed to update role permissions.'));
    } finally {
      setPermissionSavingKey(null);
    }
  };

  const handleMemberPermissionSet = async (
    memberId: string,
    key: PermissionKey,
    nextValue: PermissionValue
  ) => {
    if (!canManageChannelPermissions) return;
    const row = memberRows.find((memberRow) => memberRow.memberId === memberId);
    if (!row || row.isOwner) return;

    const previousRow = row;
    const nextRow: ChannelMemberPermissionItem = {
      ...row,
      [key]: nextValue,
    };

    setMemberRows((prev) =>
      prev.map((memberRow) => (memberRow.memberId === memberId ? nextRow : memberRow))
    );

    setPermissionError(null);
    setPermissionSavingKey(`member:${memberId}:${key}`);

    try {
      await onSaveMemberPermissions(memberId, {
        canView: nextRow.canView,
        canSend: nextRow.canSend,
        canManage: nextRow.canManage,
      });
    } catch (err: unknown) {
      setMemberRows((prev) =>
        prev.map((memberRow) => (memberRow.memberId === memberId ? previousRow : memberRow))
      );
      setPermissionError(getErrorMessage(err, 'Failed to update member permissions.'));
    } finally {
      setPermissionSavingKey(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="xl"
        className="bg-surface-legal border-border-deep text-white max-h-[85vh] md:w-[min(94vw,980px)] md:max-w-none md:h-[min(86dvh,780px)] md:max-h-[calc(100dvh-1.5rem)] min-h-0 flex flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border-dialog px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-2xl font-bold text-white">Channel Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabKey)}
          className="min-h-0 flex flex-1 flex-col gap-0 overflow-hidden"
        >
          <div className="shrink-0 border-b border-border-dialog px-4 py-3 sm:px-6">
            <TabsList className="bg-surface-panel h-auto w-full flex-wrap justify-start border border-border">
              {canManageChannelStructure && (
                <TabsTrigger value="general" className="text-muted-foreground data-[state=active]:text-white">
                  General
                </TabsTrigger>
              )}
              {canManageChannelPermissions && (
                <TabsTrigger value="permissions" className="text-muted-foreground data-[state=active]:text-white">
                  Permissions
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-5 flex flex-col">
            <TabsContent
              value="general"
              className="min-h-0 flex-1 overflow-hidden flex flex-col data-[state=inactive]:hidden"
            >
              <form
                onSubmit={handleSave}
                className="min-h-0 flex flex-1 flex-col"
              >
                <div className="scrollbar-inset min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="space-y-2">
                  <Label htmlFor="channel-settings-name" className="text-xs font-semibold uppercase text-muted-foreground">
                    Channel Name
                  </Label>
                  <Input
                    id="channel-settings-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-surface-panel border-border text-white"
                    required
                    maxLength={80}
                    disabled={!canManageChannelStructure || saving || deleting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channel-settings-topic" className="text-xs font-semibold uppercase text-muted-foreground">
                    Topic
                  </Label>
                  <Input
                    id="channel-settings-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="bg-surface-panel border-border text-white"
                    placeholder="What is this channel for?"
                    maxLength={200}
                    disabled={!canManageChannelStructure || saving || deleting}
                  />
                </div>

                {generalError && <p className="text-sm text-red-400">{generalError}</p>}
                {!canManageChannelStructure && (
                  <p className="text-xs text-accent-amber">
                    You can view this tab, but only members with Manage Channels can edit channel structure.
                  </p>
                )}
                </div>

                <DialogFooter className="justify-between sm:justify-between mt-4 shrink-0 border-t border-border-dialog pt-4">
                  {canDelete && canManageChannelStructure ? (
                    <Button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={deleting || saving}
                      variant="ghost"
                      className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                    >
                      {deleting ? 'Deleting...' : 'Delete Channel'}
                    </Button>
                  ) : (
                    <span />
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={onClose}
                      variant="ghost"
                      className="text-white hover:underline"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || deleting || !canManageChannelStructure}
                      className="bg-primary hover:bg-primary-hover text-white"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent
              value="permissions"
              className="min-h-0 flex-1 overflow-hidden flex flex-col data-[state=inactive]:hidden"
            >
              <div className="scrollbar-inset space-y-5 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="rounded-md border border-border bg-surface-panel p-3 space-y-1">
                  <p className="text-sm font-medium text-white">How channel permissions work</p>
                  <p className="text-xs text-muted-foreground">
                    Role rows show the effective community default directly in the dropdown.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Priority: Member overwrites, then role overwrites, then community role permissions.
                  </p>
                  <p className="text-xs text-muted-foreground">At each layer, Deny overrides Allow.</p>
                </div>

              {permissionsLoadError && <p className="text-sm text-red-400">{permissionsLoadError}</p>}
              {permissionError && <p className="text-sm text-red-400">{permissionError}</p>}

              {permissionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }, (_, cardIndex) => (
                    <div
                      key={cardIndex}
                      className="rounded-lg border border-border bg-surface-panel p-3 space-y-3"
                    >
                      <Skeleton className="h-4 w-36 bg-surface-hover" />
                      {Array.from({ length: 3 }, (_, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="grid grid-cols-1 gap-2 rounded-md border border-border bg-surface-app p-2 md:grid-cols-[1fr_220px]"
                        >
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-44 bg-surface-hover" />
                            <Skeleton className="h-3 w-32 bg-surface-skeleton" />
                          </div>
                          <Skeleton className="h-9 w-full bg-surface-hover" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : !hasPermissionRows ? (
                <p className="text-muted-foreground">No roles or member overwrites found for this channel.</p>
              ) : (
                <>
                  <section className="space-y-3">
                    <h3 className="text-white font-semibold">Role Overwrites</h3>
                    <p className="text-xs text-muted-foreground">
                      Applies to everyone with that role in this channel.
                    </p>
                    <div className="space-y-2">
                      {visibleRoleRows.map((roleRow) => (
                        <div
                          key={roleRow.roleId}
                          className="bg-surface-panel rounded-lg p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{ backgroundColor: roleRow.color }}
                            />
                            <span className="text-white text-sm font-medium">
                              {roleRow.name}
                              {roleRow.isDefault ? ' (@everyone)' : ''}
                            </span>
                            {!roleRow.editable && (
                              <span className="px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber text-[10px] font-semibold uppercase tracking-wide">
                                Locked
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {PERMISSION_COLUMNS.map((column) => {
                              const value = roleRow[column.key];
                              const saveKey = `role:${roleRow.roleId}:${column.key}`;
                              const defaultValue = rolePermissionDefaultValueForKey(roleRow, column.key);
                              return (
                                <div
                                  key={column.key}
                                  className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2 items-center rounded-md border border-border bg-surface-app p-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm text-white">{column.label}</p>
                                  </div>
                                  <Select
                                    value={permissionValueToSelectValue(value)}
                                    onValueChange={(nextSelectValue) =>
                                      void handleRolePermissionSet(
                                        roleRow.roleId,
                                        column.key,
                                        permissionSelectValueToPermissionValue(
                                          nextSelectValue as PermissionSelectValue
                                        )
                                      )
                                    }
                                    disabled={
                                      permissionSavingKey !== null ||
                                      !roleRow.editable ||
                                      !canManageChannelPermissions
                                    }
                                  >
                                    <SelectTrigger className="w-full bg-surface-panel border-border text-white">
                                      <SelectValue
                                        placeholder={roleDefaultSelectLabel(defaultValue)}
                                      />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface-panel border-border text-white">
                                      <SelectItem value="default">
                                        {permissionSavingKey === saveKey
                                          ? 'Saving...'
                                          : roleDefaultSelectLabel(defaultValue)}
                                      </SelectItem>
                                      <SelectItem value="allow">Yes</SelectItem>
                                      <SelectItem value="deny">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-white font-semibold">Member Overwrites</h3>
                    <p className="text-xs text-muted-foreground">
                      Member-specific settings take priority over role overwrites.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Community owner overwrite controls are hidden in this view.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search overwrites..."
                        className="bg-surface-panel border-border text-white"
                        disabled={!canManageChannelPermissions}
                      />
                      <Select
                        value={addMemberId}
                        onValueChange={setAddMemberId}
                        disabled={!canManageChannelPermissions || availableMembersForAdd.length === 0}
                      >
                        <SelectTrigger className="w-full bg-surface-panel border-border text-white">
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent className="bg-surface-panel border-border text-white">
                          {availableMembersForAdd.length === 0 ? (
                            <SelectItem value="__none__" disabled>
                              No members left to add
                            </SelectItem>
                          ) : (
                            availableMembersForAdd.map((member) => (
                              <SelectItem key={member.memberId} value={member.memberId}>
                                {member.displayName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={handleAddMemberOverwrite}
                        disabled={
                          !canManageChannelPermissions || !addMemberId || availableMembersForAdd.length === 0
                        }
                        className="bg-primary hover:bg-primary-hover text-white"
                      >
                        Add Member Overwrite
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {filteredMemberRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No matching member overwrites.</p>
                      ) : (
                        filteredMemberRows.map((memberRow) => (
                          <div
                            key={memberRow.memberId}
                            className="bg-surface-panel rounded-lg p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm font-medium">{memberRow.displayName}</span>
                            </div>
                            <div className="space-y-2">
                              {PERMISSION_COLUMNS.map((column) => {
                                const value = memberRow[column.key];
                                const saveKey = `member:${memberRow.memberId}:${column.key}`;
                                return (
                                  <div
                                    key={column.key}
                                    className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2 items-center rounded-md border border-border bg-surface-app p-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm text-white">{column.label}</p>
                                    </div>
                                    <Select
                                      value={permissionValueToSelectValue(value)}
                                      onValueChange={(nextSelectValue) =>
                                        void handleMemberPermissionSet(
                                          memberRow.memberId,
                                          column.key,
                                          permissionSelectValueToPermissionValue(
                                            nextSelectValue as PermissionSelectValue
                                          )
                                        )
                                      }
                                      disabled={permissionSavingKey !== null || !canManageChannelPermissions}
                                    >
                                      <SelectTrigger className="w-full bg-surface-panel border-border text-white">
                                        <SelectValue placeholder={memberDefaultSelectLabel()} />
                                      </SelectTrigger>
                                      <SelectContent className="bg-surface-panel border-border text-white">
                                        <SelectItem value="default">
                                          {permissionSavingKey === saveKey
                                            ? 'Saving...'
                                            : memberDefaultSelectLabel()}
                                        </SelectItem>
                                        <SelectItem value="allow">Yes</SelectItem>
                                        <SelectItem value="deny">No</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}
              </div>

              <div className="flex justify-end mt-4 shrink-0 border-t border-border-dialog pt-4">
                <Button
                  type="button"
                  onClick={onClose}
                  variant="ghost"
                  className="text-white hover:underline"
                >
                  Close
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent className="bg-surface-legal border-border-deep text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Channel?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This cannot be undone. All messages in this channel will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-white">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDelete()}
                className="bg-red-600 text-white hover:bg-red-500"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Channel'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
