/**
 * MobileServerSettingsSheet — mobile-native server settings using MobileSettingsSheet composition.
 *
 * Pages: Overview → Roles → Members → Invites → Bans
 *
 * Props are identical to ServerSettingsModal so MobileChatApp can swap between them
 * without changing the data-wiring.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronRight, Copy, Check, Trash2, UserX, Shield } from 'lucide-react';
import { MobileSettingsSheet } from '@/renderer/mobile/settings/MobileSettingsSheet';
import { getErrorMessage } from '@/shared/lib/errors';
import type {
  CommunityBanItem,
  PermissionCatalogItem,
  ServerMemberRoleItem,
  ServerRoleItem,
} from '@/lib/backend/types';
import type { ServerSettingsValues, ServerInviteItem } from '@/components/ServerSettingsModal';

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'} ${checked ? 'bg-blue-500' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Section label + card wrapper ─────────────────────────────────────────────

function SectionCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      {label && (
        <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2 px-1">
          {label}
        </p>
      )}
      <div className="rounded-xl bg-white/3 border border-white/5 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function CardRow({
  label,
  description,
  children,
  onClick,
  destructive,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const base = 'w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 text-left';

  const inner = (
    <>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${destructive ? 'text-red-400' : 'text-gray-200'}`}>{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hover:bg-white/5 active:bg-white/10 transition-colors`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

// ── Inline text input helper ──────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors resize-none disabled:opacity-50"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          enterKeyHint="done"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
        />
      )}
    </div>
  );
}

// ── Overview page ─────────────────────────────────────────────────────────────

function OverviewPage({
  initialValues,
  loading,
  loadError,
  canManageServer,
  onSave,
}: {
  initialValues: ServerSettingsValues | null;
  loading: boolean;
  loadError: string | null;
  canManageServer: boolean;
  onSave: (v: ServerSettingsValues) => Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialValues) {
      setName(initialValues.name);
      setDescription(initialValues.description ?? '');
    }
  }, [initialValues]);

  const handleSave = async () => {
    if (!initialValues) return;
    if (!name.trim()) { setError('Server name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...initialValues,
        name: name.trim(),
        description: description.trim() || null,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save server settings.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return <p className="px-4 py-6 text-sm text-red-400">{loadError}</p>;
  }

  return (
    <div className="px-4 py-4">
      <FieldInput
        label="Server Name"
        value={name}
        onChange={setName}
        placeholder="My Server"
        disabled={!canManageServer || saving}
      />
      <FieldInput
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="What's this server about?"
        multiline
        disabled={!canManageServer || saving}
      />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {canManageServer && (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// ── Roles page ────────────────────────────────────────────────────────────────

function RolesPage({
  roles,
  members,
  permissionsCatalog,
  loading,
  error: loadError,
  canManageRoles,
  isOwner,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onSaveRolePermissions,
  onSaveMemberRoles,
}: {
  roles: ServerRoleItem[];
  members: ServerMemberRoleItem[];
  permissionsCatalog: PermissionCatalogItem[];
  loading: boolean;
  error: string | null;
  canManageRoles: boolean;
  isOwner: boolean;
  onCreateRole: (v: { name: string; color: string; position: number }) => Promise<void>;
  onUpdateRole: (v: { roleId: string; name: string; color: string; position: number }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSaveRolePermissions: (roleId: string, permissionKeys: string[]) => Promise<void>;
  onSaveMemberRoles: (memberId: string, roleIds: string[]) => Promise<void>;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#7289da');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  useEffect(() => {
    if (!selectedRole) { setEditName(''); setEditColor('#7289da'); setEditPerms([]); return; }
    setEditName(selectedRole.name);
    setEditColor(selectedRole.color);
    setEditPerms(selectedRole.permissionKeys);
    setActionError(null);
  }, [selectedRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (selectedRole) {
    const togglePerm = (key: string) => {
      setEditPerms((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    };

    const handleSave = async () => {
      if (!selectedRole) return;
      setSaving(true);
      setActionError(null);
      try {
        await onUpdateRole({ roleId: selectedRole.id, name: editName.trim(), color: editColor, position: selectedRole.position });
        await onSaveRolePermissions(selectedRole.id, editPerms);
      } catch (err: unknown) {
        setActionError(getErrorMessage(err, 'Failed to save role.'));
      } finally {
        setSaving(false);
      }
    };

    const handleDelete = async () => {
      setSaving(true);
      try {
        await onDeleteRole(selectedRole.id);
        setSelectedRoleId(null);
      } catch (err: unknown) {
        setActionError(getErrorMessage(err, 'Failed to delete role.'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => setSelectedRoleId(null)}
          className="flex items-center gap-1 text-blue-400 text-sm mb-4 hover:text-blue-300"
        >
          ← All Roles
        </button>

        <FieldInput label="Role Name" value={editName} onChange={setEditName} disabled={!canManageRoles || saving} />

        <div className="mb-4">
          <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
            Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              disabled={!canManageRoles || saving}
              className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer disabled:opacity-50"
            />
            <span className="text-sm text-gray-400 font-mono">{editColor}</span>
          </div>
        </div>

        <SectionCard label="Permissions">
          {permissionsCatalog.map((perm) => (
            <CardRow
              key={perm.key}
              label={perm.key.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')}
              description={perm.description}
            >
              <Toggle
                checked={editPerms.includes(perm.key)}
                onChange={() => togglePerm(perm.key)}
                disabled={!canManageRoles || saving || selectedRole.isDefault || selectedRole.isSystem}
              />
            </CardRow>
          ))}
        </SectionCard>

        {actionError && <p className="text-sm text-red-400 mb-3">{actionError}</p>}

        {canManageRoles && !selectedRole.isSystem && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Role'}
            </button>
            {!selectedRole.isDefault && isOwner && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="py-3 px-4 rounded-xl bg-red-900/40 border border-red-700/40 text-red-400 font-semibold text-sm transition-colors disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Role list
  return (
    <div className="px-4 py-4">
      <SectionCard label="Roles">
        {roles.map((role) => (
          <CardRow
            key={role.id}
            label={role.name}
            description={`${role.memberCount} member${role.memberCount !== 1 ? 's' : ''}`}
            onClick={() => setSelectedRoleId(role.id)}
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: role.color }} />
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </div>
          </CardRow>
        ))}
      </SectionCard>

      {canManageRoles && (
        <SectionCard label="Create Role">
          <div className="px-4 py-3">
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors mb-3"
            />
            <button
              type="button"
              disabled={!newRoleName.trim() || creating}
              onClick={async () => {
                setCreating(true);
                try {
                  await onCreateRole({ name: newRoleName.trim(), color: '#7289da', position: roles.length });
                  setNewRoleName('');
                } finally {
                  setCreating(false);
                }
              }}
              className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '+ Create Role'}
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Members page ──────────────────────────────────────────────────────────────

function MembersPage({
  members,
  roles,
  canManageMembers,
  onSaveMemberRoles,
}: {
  members: ServerMemberRoleItem[];
  roles: ServerRoleItem[];
  canManageMembers: boolean;
  onSaveMemberRoles: (memberId: string, roleIds: string[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [draftRoleIds, setDraftRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => members.filter((m) => m.displayName.toLowerCase().includes(search.toLowerCase())),
    [members, search]
  );

  const selectedMember = members.find((m) => m.memberId === selectedMemberId) ?? null;

  useEffect(() => {
    if (!selectedMember) return;
    setDraftRoleIds(selectedMember.roleIds);
  }, [selectedMember?.memberId]);

  if (selectedMember) {
    const toggleRole = (roleId: string) => {
      setDraftRoleIds((prev) =>
        prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
      );
    };

    const assignableRoles = roles.filter((r) => !r.isSystem);

    return (
      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => setSelectedMemberId(null)}
          className="flex items-center gap-1 text-blue-400 text-sm mb-4 hover:text-blue-300"
        >
          ← All Members
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {selectedMember.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-white font-semibold">{selectedMember.displayName}</p>
            <p className="text-xs text-gray-500">{selectedMember.roleIds.length} role{selectedMember.roleIds.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <SectionCard label="Roles">
          {assignableRoles.map((role) => (
            <CardRow key={role.id} label={role.name}>
              <Toggle
                checked={draftRoleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                disabled={!canManageMembers || saving || role.isDefault}
              />
            </CardRow>
          ))}
        </SectionCard>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {canManageMembers && (
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSaveMemberRoles(selectedMember.memberId, draftRoleIds);
                setSelectedMemberId(null);
              } catch (err: unknown) {
                setError(getErrorMessage(err, 'Failed to save member roles.'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Roles'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors mb-4"
      />

      <SectionCard>
        {filtered.length === 0 && (
          <div className="py-6 text-center text-gray-500 text-sm">No members found</div>
        )}
        {filtered.map((member) => (
          <CardRow
            key={member.memberId}
            label={member.displayName}
            description={member.roleIds.length > 0 ? `${member.roleIds.length} role${member.roleIds.length !== 1 ? 's' : ''}` : 'No roles'}
            onClick={canManageMembers ? () => setSelectedMemberId(member.memberId) : undefined}
          >
            {canManageMembers && <ChevronRight className="w-4 h-4 text-gray-600" />}
          </CardRow>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Invites page ──────────────────────────────────────────────────────────────

function InvitesPage({
  invites,
  loading,
  error: loadError,
  canManageInvites,
  inviteBaseUrl,
  onCreateInvite,
  onRevokeInvite,
}: {
  invites: ServerInviteItem[];
  loading: boolean;
  error: string | null;
  canManageInvites: boolean;
  inviteBaseUrl: string;
  onCreateInvite: (v: { maxUses: number | null; expiresInHours: number | null }) => Promise<ServerInviteItem>;
  onRevokeInvite: (id: string) => Promise<void>;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const copyInviteLink = async (invite: ServerInviteItem) => {
    const url = `${inviteBaseUrl}/${invite.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {canManageInvites && (
        <button
          type="button"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            setActionError(null);
            try {
              await onCreateInvite({ maxUses: null, expiresInHours: 24 });
            } catch (err: unknown) {
              setActionError(getErrorMessage(err, 'Failed to create invite.'));
            } finally {
              setCreating(false);
            }
          }}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors mb-4 disabled:opacity-60"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '+ Create Invite Link'}
        </button>
      )}

      {loadError && <p className="text-sm text-red-400 mb-3">{loadError}</p>}
      {actionError && <p className="text-sm text-red-400 mb-3">{actionError}</p>}

      <SectionCard label="Active Invites">
        {invites.length === 0 && (
          <div className="py-6 text-center text-gray-500 text-sm">No active invites</div>
        )}
        {invites.filter((i) => i.isActive).map((invite) => (
          <CardRow
            key={invite.id}
            label={invite.code}
            description={[
              invite.maxUses ? `${invite.currentUses}/${invite.maxUses} uses` : `${invite.currentUses} uses`,
              invite.expiresAt ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}` : 'No expiry',
            ].join(' · ')}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyInviteLink(invite)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
              >
                {copiedId === invite.id ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              {canManageInvites && (
                <button
                  type="button"
                  onClick={() => void onRevokeInvite(invite.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-900/30 transition-colors text-gray-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </CardRow>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Bans page ─────────────────────────────────────────────────────────────────

function BansPage({
  bans,
  loading,
  error: loadError,
  canManageBans,
  onUnbanUser,
}: {
  bans: CommunityBanItem[];
  loading: boolean;
  error: string | null;
  canManageBans: boolean;
  onUnbanUser: (v: { targetUserId: string; reason?: string | null }) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {loadError && <p className="text-sm text-red-400 mb-3">{loadError}</p>}

      <SectionCard label={`Banned Users (${bans.length})`}>
        {bans.length === 0 && (
          <div className="py-6 text-center text-gray-500 text-sm">No banned users</div>
        )}
        {bans.map((ban) => (
          <CardRow
            key={ban.bannedUserId}
            label={ban.username ?? ban.bannedUserId}
            description={ban.reason ?? undefined}
          >
            {canManageBans && (
              <button
                type="button"
                disabled={busyId === ban.bannedUserId}
                onClick={async () => {
                  setBusyId(ban.bannedUserId);
                  try {
                    await onUnbanUser({ targetUserId: ban.bannedUserId });
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-colors disabled:opacity-50"
              >
                {busyId === ban.bannedUserId ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserX className="w-3 h-3" />
                )}
                Unban
              </button>
            )}
          </CardRow>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MobileServerSettingsSheetProps {
  open: boolean;
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
  onUpdateRole: (values: { roleId: string; name: string; color: string; position: number }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSaveRolePermissions: (roleId: string, permissionKeys: string[]) => Promise<void>;
  onSaveMemberRoles: (memberId: string, roleIds: string[]) => Promise<void>;
  onCreateInvite: (values: { maxUses: number | null; expiresInHours: number | null }) => Promise<ServerInviteItem>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onUnbanUser: (values: { targetUserId: string; reason?: string | null }) => Promise<void>;
}

export function MobileServerSettingsSheet({
  open,
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
}: MobileServerSettingsSheetProps) {
  return (
    <MobileSettingsSheet open={open} onClose={onClose} title="Server Settings">
      <MobileSettingsSheet.Nav>
        {canManageServer && (
          <MobileSettingsSheet.NavItem
            page="overview"
            icon={<Shield className="w-4 h-4" />}
            label="Overview"
            description="Name, description, and settings"
          />
        )}
        {canManageRoles && (
          <MobileSettingsSheet.NavItem
            page="roles"
            icon={<Shield className="w-4 h-4" />}
            label="Roles"
            description="Create and manage roles and permissions"
          />
        )}
        {canManageMembers && (
          <MobileSettingsSheet.NavItem
            page="members"
            icon={<Shield className="w-4 h-4" />}
            label="Members"
            description="Assign roles to members"
          />
        )}
        {canManageInvites && (
          <MobileSettingsSheet.NavItem
            page="invites"
            icon={<Shield className="w-4 h-4" />}
            label="Invites"
            description="Create and manage invite links"
          />
        )}
        {canManageBans && (
          <MobileSettingsSheet.NavItem
            page="bans"
            icon={<UserX className="w-4 h-4" />}
            label="Bans"
            description="View and lift user bans"
          />
        )}
      </MobileSettingsSheet.Nav>

      <MobileSettingsSheet.Page id="overview">
        <OverviewPage
          initialValues={initialValues}
          loading={loadingInitialValues}
          loadError={initialLoadError}
          canManageServer={canManageServer}
          onSave={onSave}
        />
      </MobileSettingsSheet.Page>

      <MobileSettingsSheet.Page id="roles">
        <RolesPage
          roles={roles}
          members={members}
          permissionsCatalog={permissionsCatalog}
          loading={roleManagementLoading}
          error={roleManagementError}
          canManageRoles={canManageRoles}
          isOwner={isOwner}
          onCreateRole={onCreateRole}
          onUpdateRole={onUpdateRole}
          onDeleteRole={onDeleteRole}
          onSaveRolePermissions={onSaveRolePermissions}
          onSaveMemberRoles={onSaveMemberRoles}
        />
      </MobileSettingsSheet.Page>

      <MobileSettingsSheet.Page id="members">
        <MembersPage
          members={members}
          roles={roles}
          canManageMembers={canManageMembers}
          onSaveMemberRoles={onSaveMemberRoles}
        />
      </MobileSettingsSheet.Page>

      <MobileSettingsSheet.Page id="invites">
        <InvitesPage
          invites={invites}
          loading={invitesLoading}
          error={invitesError}
          canManageInvites={canManageInvites}
          inviteBaseUrl={inviteBaseUrl}
          onCreateInvite={onCreateInvite}
          onRevokeInvite={onRevokeInvite}
        />
      </MobileSettingsSheet.Page>

      <MobileSettingsSheet.Page id="bans">
        <BansPage
          bans={bans}
          loading={bansLoading}
          error={bansError}
          canManageBans={canManageBans}
          onUnbanUser={onUnbanUser}
        />
      </MobileSettingsSheet.Page>
    </MobileSettingsSheet>
  );
}
