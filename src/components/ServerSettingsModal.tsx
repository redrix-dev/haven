import React, { useEffect, useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Database } from '@/types/database';

type DeveloperAccessMode = Database['public']['Enums']['developer_access_mode'];

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
  canManageDeveloperAccess: boolean;
  canManageInvites: boolean;
  invites: ServerInviteItem[];
  invitesLoading: boolean;
  invitesError: string | null;
  inviteBaseUrl: string;
  onClose: () => void;
  onSave: (values: ServerSettingsValues) => Promise<void>;
  onCreateInvite: (values: {
    maxUses: number | null;
    expiresInHours: number | null;
  }) => Promise<ServerInviteItem>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
}

export function ServerSettingsModal({
  channels,
  initialValues,
  loadingInitialValues,
  initialLoadError,
  canManageDeveloperAccess,
  canManageInvites,
  invites,
  invitesLoading,
  invitesError,
  inviteBaseUrl,
  onClose,
  onSave,
  onCreateInvite,
  onRevokeInvite,
}: ServerSettingsModalProps) {
  const [values, setValues] = useState<ServerSettingsValues | null>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteMaxUsesInput, setInviteMaxUsesInput] = useState('');
  const [inviteExpiryHoursInput, setInviteExpiryHoursInput] = useState('168');
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues);
    setError(null);
  }, [initialValues]);

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

  const handleCreateInvite = async () => {
    const maxUses = parsePositiveIntegerOrNull(inviteMaxUsesInput);
    const expiresInHours = parsePositiveIntegerOrNull(inviteExpiryHoursInput);

    if (inviteMaxUsesInput.trim() && maxUses === null) {
      setInviteActionError('Max uses must be a whole number greater than 0.');
      return;
    }

    if (inviteExpiryHoursInput.trim() && expiresInHours === null) {
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
    } catch (err: any) {
      setInviteActionError(err?.message ?? 'Failed to create invite link.');
    } finally {
      setInviteCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setInviteActionError(null);
    try {
      await onRevokeInvite(inviteId);
    } catch (err: any) {
      setInviteActionError(err?.message ?? 'Failed to revoke invite link.');
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save server settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-[#18243a] border-[#142033] text-white w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Server Settings</DialogTitle>
        </DialogHeader>

        {initialLoadError ? (
          <div className="space-y-4">
            <p className="text-sm text-red-400">{initialLoadError}</p>
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
          </div>
        ) : loadingInitialValues || !values ? (
          <p className="text-[#a9b8cf]">Loading settings...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="space-y-4">
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
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md bg-[#142033] px-3 py-2">
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
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md bg-[#142033] px-3 py-2">
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
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-white font-semibold">Haven Developer Access</h3>

              <p className="text-sm text-[#a9b8cf]">
                Configure whether Haven developers can send official messages inside this server.
              </p>

              <div className="flex items-center justify-between gap-3 rounded-md bg-[#142033] px-3 py-2">
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
                        className="flex items-center gap-3 text-sm text-[#e6edf7] bg-[#142033] rounded-md p-2"
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

            <section className="space-y-4">
              <h3 className="text-white font-semibold">Invite Links</h3>

              <p className="text-sm text-[#a9b8cf]">
                Create and share invite links for this server.
              </p>

              {canManageInvites ? (
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
                    placeholder="Expires in hours (blank = never)"
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
              ) : (
                <p className="text-xs text-[#d6a24a]">
                  You can view active invites, but only members with Manage Invites can create or
                  revoke them.
                </p>
              )}

              {inviteActionError && <p className="text-sm text-red-400">{inviteActionError}</p>}
              {invitesError && <p className="text-sm text-red-400">{invitesError}</p>}

              {invitesLoading ? (
                <p className="text-sm text-[#a9b8cf]">Loading invites...</p>
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
            </section>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <DialogFooter className="gap-3">
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
                disabled={saving}
                className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

