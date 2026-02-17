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

type TabKey = 'general' | 'permissions';

const PERMISSION_COLUMNS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'canView', label: 'View' },
  { key: 'canSend', label: 'Send' },
  { key: 'canManage', label: 'Manage' },
];

function nextPermissionValue(value: PermissionValue): PermissionValue {
  if (value === null) return true;
  if (value === true) return false;
  return null;
}

function permissionLabel(value: PermissionValue): string {
  if (value === true) return 'Allow';
  if (value === false) return 'Deny';
  return 'Inherit';
}

function permissionClassName(value: PermissionValue): string {
  if (value === true) {
    return 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40';
  }
  if (value === false) {
    return 'bg-red-600/20 text-red-300 border border-red-500/40';
  }
  return 'bg-[#142033] text-[#a9b8cf] border border-[#304867]';
}

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
    } catch (err: any) {
      setGeneralError(err?.message ?? 'Failed to save channel settings.');
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
    } catch (err: any) {
      setGeneralError(err?.message ?? 'Failed to delete channel.');
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

  const handleRolePermissionToggle = async (roleId: string, key: PermissionKey) => {
    const row = roleRows.find((roleRow) => roleRow.roleId === roleId);
    if (!row || !row.editable) return;

    const previousRow = row;
    const nextRow: ChannelRolePermissionItem = {
      ...row,
      [key]: nextPermissionValue(row[key]),
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
    } catch (err: any) {
      setRoleRows((prev) =>
        prev.map((roleRow) => (roleRow.roleId === roleId ? previousRow : roleRow))
      );
      setPermissionError(err?.message ?? 'Failed to update role permissions.');
    } finally {
      setPermissionSavingKey(null);
    }
  };

  const handleMemberPermissionToggle = async (memberId: string, key: PermissionKey) => {
    const row = memberRows.find((memberRow) => memberRow.memberId === memberId);
    if (!row) return;

    const previousRow = row;
    const nextRow: ChannelMemberPermissionItem = {
      ...row,
      [key]: nextPermissionValue(row[key]),
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
    } catch (err: any) {
      setMemberRows((prev) =>
        prev.map((memberRow) => (memberRow.memberId === memberId ? previousRow : memberRow))
      );
      setPermissionError(err?.message ?? 'Failed to update member permissions.');
    } finally {
      setPermissionSavingKey(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-[#18243a] border-[#142033] text-white w-full max-w-4xl max-h-[85vh] overflow-y-auto"
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
            <p className="text-sm text-[#a9b8cf]">
              Each value cycles through Inherit -&gt; Allow -&gt; Deny. Changes save immediately.
            </p>

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
                        <div className="grid grid-cols-3 gap-2">
                          {PERMISSION_COLUMNS.map((column) => {
                            const value = roleRow[column.key];
                            const saveKey = `role:${roleRow.roleId}:${column.key}`;
                            return (
                              <button
                                key={column.key}
                                type="button"
                                onClick={() => void handleRolePermissionToggle(roleRow.roleId, column.key)}
                                disabled={permissionSavingKey !== null || !roleRow.editable}
                                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${permissionClassName(value)} disabled:opacity-60`}
                              >
                                {column.label}:{' '}
                                {permissionSavingKey === saveKey ? 'Saving...' : permissionLabel(value)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-white font-semibold">Member Overwrites</h3>

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
                          <div className="grid grid-cols-3 gap-2">
                            {PERMISSION_COLUMNS.map((column) => {
                              const value = memberRow[column.key];
                              const saveKey = `member:${memberRow.memberId}:${column.key}`;
                              return (
                                <button
                                  key={column.key}
                                  type="button"
                                  onClick={() =>
                                    void handleMemberPermissionToggle(memberRow.memberId, column.key)
                                  }
                                  disabled={permissionSavingKey !== null}
                                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${permissionClassName(value)} disabled:opacity-60`}
                                >
                                  {column.label}:{' '}
                                  {permissionSavingKey === saveKey ? 'Saving...' : permissionLabel(value)}
                                </button>
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

