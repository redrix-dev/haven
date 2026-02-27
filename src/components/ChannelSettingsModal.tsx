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
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/shared/lib/errors';

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

type PermissionKey = keyof ChannelPermissionState;
type PermissionSelectValue = 'default' | 'allow' | 'deny';

type TabKey = 'general' | 'permissions';

const PERMISSION_COLUMNS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'canView', label: 'View Channel' },
  { key: 'canSend', label: 'Send Messages' },
  { key: 'canManage', label: 'Manage Channel' },
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

const permissionLabel = (value: PermissionValue, defaultValue?: boolean): string => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof defaultValue === 'boolean') {
    return defaultValue ? 'Yes (default)' : 'No (default)';
  }
  return 'Inherit';
};

const rolePermissionDefaultValueForKey = (
  row: ChannelRolePermissionItem,
  key: PermissionKey
): boolean => {
  switch (key) {
    case 'canView':
      return row.defaultCanView;
    case 'canSend':
      return row.defaultCanSend;
    case 'canManage':
      return row.defaultCanManage;
    default:
      return false;
  }
};

const permissionSentence = (subject: string, key: PermissionKey): string => {
  switch (key) {
    case 'canView':
      return `${subject} can view this channel`;
    case 'canSend':
      return `${subject} can send messages`;
    case 'canManage':
      return `${subject} can manage this channel`;
    default:
      return subject;
  }
};

export function ChannelSettingsModal({
  initialName,
  initialTopic,
  canDelete,
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
  const [activeTab, setActiveTab] = useState<TabKey>('general');
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

  const hasPermissionRows = useMemo(
    () => roleRows.length > 0 || memberRows.length > 0,
    [roleRows.length, memberRows.length]
  );

  const availableMembersForAdd = useMemo(() => {
    const existingMemberIds = new Set(memberRows.map((memberRow) => memberRow.memberId));
    return availableMembers.filter((member) => !existingMemberIds.has(member.memberId));
  }, [availableMembers, memberRows]);

  const filteredMemberRows = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return memberRows;
    return memberRows.filter((memberRow) => memberRow.displayName.toLowerCase().includes(query));
  }, [memberRows, memberSearch]);

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
    const row = memberRows.find((memberRow) => memberRow.memberId === memberId);
    if (!row) return;

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
        className="scrollbar-inset bg-[#18243a] border-[#142033] text-white max-h-[85vh] overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Channel Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-5">
          <TabsList className="bg-[#142033]">
            <TabsTrigger value="general" className="text-[#a9b8cf] data-[state=active]:text-white">
              General
            </TabsTrigger>
            <TabsTrigger value="permissions" className="text-[#a9b8cf] data-[state=active]:text-white">
              Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channel-settings-name" className="text-xs font-semibold uppercase text-[#a9b8cf]">
                  Channel Name
                </Label>
                <Input
                  id="channel-settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[#142033] border-[#304867] text-white"
                  required
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="channel-settings-topic" className="text-xs font-semibold uppercase text-[#a9b8cf]">
                  Topic
                </Label>
                <Input
                  id="channel-settings-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="bg-[#142033] border-[#304867] text-white"
                  placeholder="What is this channel for?"
                  maxLength={200}
                />
              </div>

              {generalError && <p className="text-sm text-red-400">{generalError}</p>}

              <DialogFooter className="justify-between sm:justify-between">
                {canDelete ? (
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
                    disabled={saving || deleting}
                    className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-5">
            <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-1">
              <p className="text-sm font-medium text-white">How channel permissions work</p>
              <p className="text-xs text-[#a9b8cf]">
                Role rows show the effective server default directly in the dropdown (for example,
                “Yes (default)”).
              </p>
              <p className="text-xs text-[#a9b8cf]">
                Priority: Member overwrites, then role overwrites, then server role permissions.
              </p>
              <p className="text-xs text-[#a9b8cf]">At each layer, Deny overrides Allow.</p>
            </div>

            {permissionsLoadError && <p className="text-sm text-red-400">{permissionsLoadError}</p>}
            {permissionError && <p className="text-sm text-red-400">{permissionError}</p>}

            {permissionsLoading ? (
              <p className="text-[#a9b8cf]">Loading channel permissions...</p>
            ) : !hasPermissionRows ? (
              <p className="text-[#a9b8cf]">No roles or member overwrites found for this channel.</p>
            ) : (
              <>
                <section className="space-y-3">
                  <h3 className="text-white font-semibold">Role Overwrites</h3>
                  <p className="text-xs text-[#8ea4c7]">
                    Applies to everyone with that role in this channel.
                  </p>
                  <div className="space-y-2">
                    {roleRows.map((roleRow) => (
                      <div
                        key={roleRow.roleId}
                        className="bg-[#142033] rounded-lg p-3 flex flex-col gap-2"
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
                            <span className="px-1.5 py-0.5 rounded bg-[#d6a24a]/20 text-[#d6a24a] text-[10px] font-semibold uppercase tracking-wide">
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
                                className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2 items-center rounded-md border border-[#304867] bg-[#111a2b] p-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm text-white">
                                    {permissionSentence(roleRow.name, column.key)}
                                  </p>
                                  <p className="text-xs text-[#8ea4c7]">
                                    Server default: {defaultValue ? 'Yes' : 'No'}
                                  </p>
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
                                  disabled={permissionSavingKey !== null || !roleRow.editable}
                                >
                                  <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                                    <SelectValue
                                      placeholder={permissionLabel(null, defaultValue)}
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#142033] border-[#304867] text-white">
                                    <SelectItem value="default">
                                      {permissionSavingKey === saveKey
                                        ? 'Saving...'
                                        : permissionLabel(null, defaultValue)}
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
                  <p className="text-xs text-[#8ea4c7]">
                    Member-specific settings take priority over role overwrites.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search overwrites..."
                      className="bg-[#142033] border-[#304867] text-white"
                    />
                    <Select
                      value={addMemberId}
                      onValueChange={setAddMemberId}
                      disabled={availableMembersForAdd.length === 0}
                    >
                      <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#142033] border-[#304867] text-white">
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
                      disabled={!addMemberId || availableMembersForAdd.length === 0}
                      className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                    >
                      Add Member Overwrite
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {filteredMemberRows.length === 0 ? (
                      <p className="text-sm text-[#a9b8cf]">No matching member overwrites.</p>
                    ) : (
                      filteredMemberRows.map((memberRow) => (
                        <div
                          key={memberRow.memberId}
                          className="bg-[#142033] rounded-lg p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">{memberRow.displayName}</span>
                            {memberRow.isOwner && (
                              <span className="px-1.5 py-0.5 rounded bg-[#3f79d8]/20 text-[#b7c5ff] text-[10px] font-semibold uppercase tracking-wide">
                                Owner
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {PERMISSION_COLUMNS.map((column) => {
                              const value = memberRow[column.key];
                              const saveKey = `member:${memberRow.memberId}:${column.key}`;
                              return (
                                <div
                                  key={column.key}
                                  className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2 items-center rounded-md border border-[#304867] bg-[#111a2b] p-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm text-white">
                                      {permissionSentence(memberRow.displayName, column.key)}
                                    </p>
                                    <p className="text-xs text-[#8ea4c7]">
                                      Member-specific override (takes priority over roles)
                                    </p>
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
                                    disabled={permissionSavingKey !== null}
                                  >
                                    <SelectTrigger className="w-full bg-[#142033] border-[#304867] text-white">
                                      <SelectValue placeholder={permissionLabel(null)} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#142033] border-[#304867] text-white">
                                      <SelectItem value="default">
                                        {permissionSavingKey === saveKey ? 'Saving...' : permissionLabel(null)}
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

            <div className="flex justify-end">
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
        </Tabs>

        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent className="bg-[#18243a] border-[#142033] text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Channel?</AlertDialogTitle>
              <AlertDialogDescription className="text-[#a9b8cf]">
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

