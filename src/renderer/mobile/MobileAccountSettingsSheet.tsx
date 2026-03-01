import React, { useState } from 'react';
import { X, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/errors';
import type { UpdaterStatus } from '@/shared/desktop/types';

interface MobileAccountSettingsSheetProps {
  open: boolean;
  userEmail: string;
  initialUsername: string;
  initialAvatarUrl: string | null;
  autoUpdateEnabled: boolean;
  updaterStatus: UpdaterStatus | null;
  updaterStatusLoading: boolean;
  checkingForUpdates: boolean;
  onClose: () => void;
  onSave: (values: { username: string; avatarUrl: string | null }) => Promise<void>;
  onAutoUpdateChange: (enabled: boolean) => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

type ConfirmState = 'none' | 'disable-updates' | 'sign-out' | 'delete-account';

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
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
        disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'
      } ${checked ? 'bg-blue-500' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function MobileAccountSettingsSheet({
  open,
  userEmail,
  initialUsername,
  initialAvatarUrl,
  autoUpdateEnabled,
  updaterStatus,
  updaterStatusLoading,
  checkingForUpdates,
  onClose,
  onSave,
  onAutoUpdateChange,
  onCheckForUpdates,
  onSignOut,
  onDeleteAccount,
}: MobileAccountSettingsSheetProps) {
  const [username, setUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [updatingAutoUpdate, setUpdatingAutoUpdate] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>('none');
  const [error, setError] = useState<string | null>(null);
  const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);

  const updaterControlsUnsupported = updaterStatus?.supported === false;
  const previewInitial = username.trim().charAt(0).toUpperCase() || 'U';

  const updaterStatusLabel = (() => {
    if (!updaterStatus) return 'Unavailable';
    switch (updaterStatus.status) {
      case 'ready': return updaterStatus.enabled ? 'Enabled' : 'Disabled';
      case 'checking': return 'Checking...';
      case 'update_available': return 'Update available';
      case 'up_to_date': return 'Up to date';
      case 'update_downloaded': return 'Update downloaded';
      case 'unsupported_platform': return 'Unsupported platform';
      case 'dev_mode': return 'Dev mode';
      case 'disabled': return 'Disabled';
      case 'disabled_pending_restart': return 'Disabled (restart required)';
      case 'error': return 'Update error';
      default: return 'Idle';
    }
  })();

  const handleSave = async () => {
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ username: username.trim(), avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save account settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoUpdateToggle = async (enabled: boolean) => {
    if (updaterControlsUnsupported) return;
    if (!enabled && autoUpdateEnabled) {
      setConfirmState('disable-updates');
      return;
    }
    setUpdatingAutoUpdate(true);
    setAutoUpdateError(null);
    try {
      await onAutoUpdateChange(enabled);
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to update auto-update preference.'));
    } finally {
      setUpdatingAutoUpdate(false);
    }
  };

  const handleDisableUpdatesConfirmed = async () => {
    setConfirmState('none');
    setUpdatingAutoUpdate(true);
    setAutoUpdateError(null);
    try {
      await onAutoUpdateChange(false);
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to update auto-update preference.'));
    } finally {
      setUpdatingAutoUpdate(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if (updaterControlsUnsupported) return;
    setAutoUpdateError(null);
    try {
      await onCheckForUpdates();
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to check for updates.'));
    }
  };

  const handleSignOut = async () => {
    setProcessingAction(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setProcessingAction(false);
      setConfirmState('none');
    }
  };

  const handleDeleteAccount = async () => {
    setProcessingAction(true);
    setError(null);
    try {
      await onDeleteAccount();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete account.'));
    } finally {
      setProcessingAction(false);
      setConfirmState('none');
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 touch-none overscroll-none"
        onClick={() => {
          if (confirmState !== 'none') { setConfirmState('none'); return; }
          onClose();
        }}
      />

      {/* Sheet */}
      <div className="mobile-bottom-sheet fixed inset-x-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10 flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-white">Account Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">

          {/* Profile section */}
          <div className="mt-4 flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 border border-blue-500/40 flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden">
              {avatarUrl.trim() ? (
                <img src={avatarUrl.trim()} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                previewInitial
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Email</p>
              <p className="text-sm text-white truncate">{userEmail}</p>
            </div>
          </div>

          {/* Username */}
          <div className="mb-4">
            <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={32}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              placeholder="Your username"
            />
          </div>

          {/* Avatar URL */}
          <div className="mb-5">
            <label className="block text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
              Avatar URL
            </label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              placeholder="https://..."
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 mb-4">{error}</p>
          )}

          {/* Auto-update section */}
          <div className="mb-2">
            <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">App Updates</p>
            <div className="rounded-xl bg-white/3 border border-white/5 px-4">
              <div className="flex items-center justify-between gap-3 py-3.5 border-b border-white/5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200">Automatic Updates</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {updaterStatusLoading ? 'Loading...' : `Status: ${updaterStatusLabel}`}
                  </p>
                </div>
                <Toggle
                  checked={autoUpdateEnabled}
                  onChange={handleAutoUpdateToggle}
                  disabled={updatingAutoUpdate || updaterControlsUnsupported}
                />
              </div>
              <div className="flex items-center justify-between gap-3 py-3.5">
                <p className="text-sm text-gray-200">Check for Updates</p>
                <button
                  onClick={() => void handleCheckForUpdates()}
                  disabled={checkingForUpdates || updaterStatusLoading || updaterControlsUnsupported}
                  className="text-xs font-medium text-blue-400 disabled:opacity-40 disabled:cursor-default"
                >
                  {checkingForUpdates ? 'Checking...' : 'Check now'}
                </button>
              </div>
            </div>

            {updaterStatus?.disableNeedsRestart && (
              <p className="text-xs text-amber-300 mt-2 px-1">
                Restart required to fully stop active update checks.
              </p>
            )}
            {updaterStatus?.lastError && (
              <p className="text-xs text-red-300 mt-1 px-1">Updater: {updaterStatus.lastError}</p>
            )}
            {autoUpdateError && (
              <p className="text-xs text-red-400 mt-1 px-1">{autoUpdateError}</p>
            )}
          </div>

          {/* Danger zone */}
          <div className="mt-6 mb-2">
            <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Account</p>
            <div className="rounded-xl bg-white/3 border border-white/5">
              <button
                onClick={() => setConfirmState('sign-out')}
                disabled={processingAction}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/5 disabled:opacity-50"
              >
                <span className="text-sm text-red-400">Sign Out</span>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>
              <button
                onClick={() => setConfirmState('delete-account')}
                disabled={processingAction}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 disabled:opacity-50"
              >
                <span className="text-sm text-red-500">Delete Account</span>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="px-4 pb-8 pt-3 border-t border-white/10 shrink-0">
          <button
            onClick={() => void handleSave()}
            disabled={saving || processingAction}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Inline confirm: disable auto-updates */}
      {confirmState === 'disable-updates' && (
        <div className="mobile-bottom-card fixed inset-x-4 z-[60] rounded-2xl bg-[#111c30] border border-white/10 p-5 shadow-xl">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Disable automatic updates?</p>
              <p className="text-xs text-gray-400 mt-1">
                Turning updates off can leave you on incompatible builds and may break login, realtime,
                and voice features over time.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmState('none')}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
            >
              Keep enabled
            </button>
            <button
              onClick={() => void handleDisableUpdatesConfirmed()}
              className="flex-1 py-2.5 rounded-xl bg-red-700/80 hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              Disable
            </button>
          </div>
        </div>
      )}

      {/* Inline confirm: sign out */}
      {confirmState === 'sign-out' && (
        <div className="mobile-bottom-card fixed inset-x-4 z-[60] rounded-2xl bg-[#111c30] border border-white/10 p-5 shadow-xl">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Sign out?</p>
              <p className="text-xs text-gray-400 mt-1">
                You will need to sign back in with your credentials.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmState('none')}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSignOut()}
              disabled={processingAction}
              className="flex-1 py-2.5 rounded-xl bg-red-700/80 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {processingAction ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign Out'}
            </button>
          </div>
        </div>
      )}

      {/* Inline confirm: delete account */}
      {confirmState === 'delete-account' && (
        <div className="mobile-bottom-card fixed inset-x-4 z-[60] rounded-2xl bg-[#111c30] border border-white/10 p-5 shadow-xl">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Delete account permanently?</p>
              <p className="text-xs text-gray-400 mt-1">
                This cannot be undone. Your profile, memberships, messages, and owned communities
                will be removed permanently.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmState('none')}
              disabled={processingAction}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleDeleteAccount()}
              disabled={processingAction}
              className="flex-1 py-2.5 rounded-xl bg-red-800 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {processingAction ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete Account'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
