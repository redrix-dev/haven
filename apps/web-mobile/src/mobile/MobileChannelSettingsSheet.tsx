/**
 * MobileChannelSettingsSheet — mobile-native channel settings.
 *
 * Pages: Overview → Permissions
 *
 * Props mirror ChannelSettingsModal so the orchestration wiring is unchanged.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { MobileSettingsSheet } from '@web-mobile/mobile/settings/MobileSettingsSheet';
import { getErrorMessage } from '@platform/lib/errors';
import type {
  ChannelPermissionState,
  ChannelRolePermissionItem,
  ChannelMemberPermissionItem,
  ChannelMemberOption,
} from '@shared/components/ChannelSettingsModal';

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

// 3-state permission selector: null (default) | true (allow) | false (deny)
type ThreeState = boolean | null;

function ThreeStateSelector({
  value,
  onChange,
  defaultLabel,
  disabled,
}: {
  value: ThreeState;
  onChange: (v: ThreeState) => void;
  defaultLabel?: string;
  disabled?: boolean;
}) {
  const options: Array<{ value: ThreeState; label: string; color: string }> = [
    { value: null, label: defaultLabel ?? 'Default', color: 'text-gray-400' },
    { value: true, label: 'Allow', color: 'text-green-400' },
    { value: false, label: 'Deny', color: 'text-red-400' },
  ];

  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-white/15 ' + opt.color
              : 'bg-white/3 text-gray-500 hover:bg-white/8'
          } disabled:opacity-50`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

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
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const base = 'w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 text-left';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hover:bg-white/5 active:bg-white/10 transition-colors`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200">{label}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </button>
    );
  }
  return (
    <div className={base}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

// ── Overview page ─────────────────────────────────────────────────────────────

function OverviewPage({
  initialName,
  initialTopic,
  canManageChannelStructure,
  canDelete,
  onSave,
  onDelete,
}: {
  initialName: string;
  initialTopic: string | null;
  canManageChannelStructure: boolean;
  canDelete: boolean;
  onSave: (v: { name: string; topic: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [topic, setTopic] = useState(initialTopic ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Channel name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), topic: topic.trim() || null });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save channel settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete channel.'));
      setDeleting(false);
    }
  };

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
          Channel Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManageChannelStructure || saving}
          enterKeyHint="done"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors disabled:opacity-50"
        />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
          Topic
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={!canManageChannelStructure || saving}
          rows={2}
          placeholder="What's this channel about?"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors resize-none disabled:opacity-50"
        />
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {canManageChannelStructure && (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || deleting}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 mb-4"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
        </button>
      )}

      {canDelete && canManageChannelStructure && (
        <>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              className="w-full py-3 rounded-xl bg-red-900/30 border border-red-700/30 text-red-400 font-semibold text-sm transition-colors disabled:opacity-60"
            >
              Delete Channel
            </button>
          ) : (
            <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-4">
              <p className="text-sm text-red-300 font-semibold mb-1">Delete this channel?</p>
              <p className="text-xs text-gray-400 mb-3">This cannot be undone. All messages will be lost.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 text-white text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-700/80 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Permissions page ──────────────────────────────────────────────────────────

function PermissionsPage({
  rolePermissions,
  memberPermissions,
  availableMembers,
  loading,
  loadError,
  canManageChannelPermissions,
  onSaveRolePermissions,
  onSaveMemberPermissions,
}: {
  rolePermissions: ChannelRolePermissionItem[];
  memberPermissions: ChannelMemberPermissionItem[];
  availableMembers: ChannelMemberOption[];
  loading: boolean;
  loadError: string | null;
  canManageChannelPermissions: boolean;
  onSaveRolePermissions: (roleId: string, permissions: ChannelPermissionState) => Promise<void>;
  onSaveMemberPermissions: (memberId: string, permissions: ChannelPermissionState) => Promise<void>;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [rolePerms, setRolePerms] = useState<ChannelPermissionState>({ canView: null, canSend: null, canManage: null });
  const [memberPerms, setMemberPerms] = useState<ChannelPermissionState>({ canView: null, canSend: null, canManage: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = rolePermissions.find((r) => r.roleId === selectedRoleId) ?? null;
  const selectedMember = memberPermissions.find((m) => m.memberId === selectedMemberId) ?? null;

  useEffect(() => {
    if (!selectedRole) return;
    setRolePerms({ canView: selectedRole.canView, canSend: selectedRole.canSend, canManage: selectedRole.canManage });
  }, [selectedRole?.roleId]);

  useEffect(() => {
    if (!selectedMember) return;
    setMemberPerms({ canView: selectedMember.canView, canSend: selectedMember.canSend, canManage: selectedMember.canManage });
  }, [selectedMember?.memberId]);

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

  // Role detail
  if (selectedRole) {
    return (
      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => setSelectedRoleId(null)}
          className="flex items-center gap-1 text-blue-400 text-sm mb-4 hover:text-blue-300"
        >
          ← Role Permissions
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: selectedRole.color }} />
          <p className="text-white font-semibold">{selectedRole.name}</p>
          {selectedRole.isDefault && (
            <span className="text-[10px] text-gray-500 bg-white/5 rounded-full px-2 py-0.5">Default</span>
          )}
        </div>

        <SectionCard label="Permissions">
          {[
            { key: 'canView' as const, label: 'View Channel' },
            { key: 'canSend' as const, label: 'Send Messages' },
          ].map(({ key, label }) => (
            <div key={key} className="px-4 py-3 border-b border-white/5 last:border-b-0">
              <p className="text-sm text-gray-200 mb-2">{label}</p>
              <ThreeStateSelector
                value={rolePerms[key]}
                onChange={(v) => setRolePerms((prev) => ({ ...prev, [key]: v }))}
                defaultLabel={selectedRole.isDefault ? `Default [${key === 'canView' ? selectedRole.defaultCanView : selectedRole.defaultCanSend ? 'Yes' : 'No'}]` : 'Inherit'}
                disabled={!canManageChannelPermissions || saving || !selectedRole.editable}
              />
            </div>
          ))}
        </SectionCard>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {canManageChannelPermissions && selectedRole.editable && (
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSaveRolePermissions(selectedRole.roleId, rolePerms);
                setSelectedRoleId(null);
              } catch (err: unknown) {
                setError(getErrorMessage(err, 'Failed to save permissions.'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Permissions'}
          </button>
        )}
      </div>
    );
  }

  // Member detail
  if (selectedMember) {
    return (
      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => setSelectedMemberId(null)}
          className="flex items-center gap-1 text-blue-400 text-sm mb-4 hover:text-blue-300"
        >
          ← Member Permissions
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {selectedMember.displayName.charAt(0).toUpperCase()}
          </div>
          <p className="text-white font-semibold">{selectedMember.displayName}</p>
        </div>

        <SectionCard label="Permissions">
          {[
            { key: 'canView' as const, label: 'View Channel' },
            { key: 'canSend' as const, label: 'Send Messages' },
          ].map(({ key, label }) => (
            <div key={key} className="px-4 py-3 border-b border-white/5 last:border-b-0">
              <p className="text-sm text-gray-200 mb-2">{label}</p>
              <ThreeStateSelector
                value={memberPerms[key]}
                onChange={(v) => setMemberPerms((prev) => ({ ...prev, [key]: v }))}
                defaultLabel="Community Default"
                disabled={!canManageChannelPermissions || saving}
              />
            </div>
          ))}
        </SectionCard>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {canManageChannelPermissions && (
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSaveMemberPermissions(selectedMember.memberId, memberPerms);
                setSelectedMemberId(null);
              } catch (err: unknown) {
                setError(getErrorMessage(err, 'Failed to save permissions.'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Permissions'}
          </button>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="px-4 py-4">
      <SectionCard label="Role Permissions">
        {rolePermissions.map((role) => (
          <CardRow
            key={role.roleId}
            label={role.name}
            description={[
              role.canView === true ? '✓ View' : role.canView === false ? '✗ View' : null,
              role.canSend === true ? '✓ Send' : role.canSend === false ? '✗ Send' : null,
            ].filter(Boolean).join(' · ') || 'Default permissions'}
            onClick={canManageChannelPermissions ? () => setSelectedRoleId(role.roleId) : undefined}
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ background: role.color }} />
              {canManageChannelPermissions && <ChevronRight className="w-4 h-4 text-gray-600" />}
            </div>
          </CardRow>
        ))}
      </SectionCard>

      {memberPermissions.length > 0 && (
        <SectionCard label="Member Permissions">
          {memberPermissions.map((member) => (
            <CardRow
              key={member.memberId}
              label={member.displayName}
              onClick={canManageChannelPermissions ? () => setSelectedMemberId(member.memberId) : undefined}
            >
              {canManageChannelPermissions && <ChevronRight className="w-4 h-4 text-gray-600" />}
            </CardRow>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MobileChannelSettingsSheetProps {
  open: boolean;
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
  onSaveRolePermissions: (roleId: string, permissions: ChannelPermissionState) => Promise<void>;
  onSaveMemberPermissions: (memberId: string, permissions: ChannelPermissionState) => Promise<void>;
}

export function MobileChannelSettingsSheet({
  open,
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
}: MobileChannelSettingsSheetProps) {
  return (
    <MobileSettingsSheet open={open} onClose={onClose} title="Channel Settings">
      <MobileSettingsSheet.Nav>
        {canManageChannelStructure && (
          <MobileSettingsSheet.NavItem
            page="overview"
            label="Overview"
            description="Name and topic"
          />
        )}
        {canManageChannelPermissions && (
          <MobileSettingsSheet.NavItem
            page="permissions"
            label="Permissions"
            description="Role and member access control"
          />
        )}
      </MobileSettingsSheet.Nav>

      <MobileSettingsSheet.Page id="overview">
        <OverviewPage
          initialName={initialName}
          initialTopic={initialTopic}
          canManageChannelStructure={canManageChannelStructure}
          canDelete={canDelete}
          onSave={onSave}
          onDelete={onDelete}
        />
      </MobileSettingsSheet.Page>

      <MobileSettingsSheet.Page id="permissions">
        <PermissionsPage
          rolePermissions={rolePermissions}
          memberPermissions={memberPermissions}
          availableMembers={availableMembers}
          loading={permissionsLoading}
          loadError={permissionsLoadError}
          canManageChannelPermissions={canManageChannelPermissions}
          onSaveRolePermissions={onSaveRolePermissions}
          onSaveMemberPermissions={onSaveMemberPermissions}
        />
      </MobileSettingsSheet.Page>
    </MobileSettingsSheet>
  );
}
