import React, { useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
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
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/shared/lib/errors';
import type { UpdaterStatus } from '@/shared/desktop/types';

interface AccountSettingsModalProps {
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
}

export function AccountSettingsModal({
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
}: AccountSettingsModalProps) {
  const [username, setUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [updatingAutoUpdatePreference, setUpdatingAutoUpdatePreference] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showDisableAutoUpdateConfirm, setShowDisableAutoUpdateConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);

  const previewInitial = username.trim().charAt(0).toUpperCase() || 'U';

  const updaterStatusLabel = (() => {
    if (!updaterStatus) return 'Unavailable';

    switch (updaterStatus.status) {
      case 'ready':
        return updaterStatus.enabled ? 'Enabled' : 'Disabled';
      case 'checking':
        return 'Checking...';
      case 'update_available':
        return 'Update available';
      case 'up_to_date':
        return 'Up to date';
      case 'update_downloaded':
        return 'Update downloaded';
      case 'unsupported_platform':
        return 'Unsupported platform';
      case 'dev_mode':
        return 'Dev mode';
      case 'disabled':
        return 'Disabled';
      case 'disabled_pending_restart':
        return 'Disabled (restart required)';
      case 'error':
        return 'Update error';
      default:
        return 'Idle';
    }
  })();

  const handleAutoUpdateChange = async (enabled: boolean) => {
    setUpdatingAutoUpdatePreference(true);
    setAutoUpdateError(null);

    try {
      await onAutoUpdateChange(enabled);
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to update auto-update preference.'));
    } finally {
      setUpdatingAutoUpdatePreference(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        username: username.trim(),
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save account settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setSigningOut(false);
    }
  };

  const handleToggleRequested = (checked: boolean) => {
    if (!checked && autoUpdateEnabled) {
      setShowDisableAutoUpdateConfirm(true);
      return;
    }

    void handleAutoUpdateChange(checked);
  };

  const handleDisableAutoUpdateConfirmed = async () => {
    setShowDisableAutoUpdateConfirm(false);
    await handleAutoUpdateChange(false);
  };

  const handleCheckForUpdates = async () => {
    setAutoUpdateError(null);
    try {
      await onCheckForUpdates();
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to check for updates.'));
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          size="sm"
          className="bg-[#18243a] border-[#142033] text-white"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Account Settings</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                size="lg"
                className="rounded-2xl bg-[#142033] border border-[#304867] data-[size=lg]:size-12"
              >
                {avatarUrl.trim() && <AvatarImage src={avatarUrl.trim()} alt="Avatar preview" />}
                <AvatarFallback className="rounded-2xl bg-[#142033] text-white font-semibold">
                  {previewInitial}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs uppercase font-semibold text-[#a9b8cf]">Email</p>
                <p className="text-sm text-white">{userEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="account-username"
                className="text-xs font-semibold uppercase text-[#a9b8cf]"
              >
                Username
              </Label>
              <Input
                id="account-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-[#142033] border-[#304867] text-white"
                maxLength={32}
                required
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="account-avatar-url"
                className="text-xs font-semibold uppercase text-[#a9b8cf]"
              >
                Avatar URL
              </Label>
              <Input
                id="account-avatar-url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="bg-[#142033] border-[#304867] text-white"
              />
            </div>

            <div className="rounded-xl border border-[#304867] bg-[#142033] px-3 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Automatic Updates</p>
                  <p className="text-xs text-[#a9b8cf]">
                    Keeps this app current with security and compatibility fixes.
                  </p>
                </div>
                <Switch
                  checked={autoUpdateEnabled}
                  onCheckedChange={handleToggleRequested}
                  disabled={updatingAutoUpdatePreference}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#a9b8cf]">
                  Status: {updaterStatusLoading ? 'Loading...' : updaterStatusLabel}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleCheckForUpdates()}
                  disabled={checkingForUpdates || updaterStatusLoading}
                  variant="secondary"
                  size="sm"
                >
                  {checkingForUpdates ? 'Checking...' : 'Check now'}
                </Button>
              </div>

              {updaterStatus?.disableNeedsRestart && (
                <p className="text-xs text-amber-300">
                  Restart required to fully stop active update checks.
                </p>
              )}

              {updaterStatus?.lastError && (
                <p className="text-xs text-red-300">Updater: {updaterStatus.lastError}</p>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {autoUpdateError && <p className="text-sm text-red-400">{autoUpdateError}</p>}

            <DialogFooter className="justify-between sm:justify-between">
              <Button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                variant="ghost"
                className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
              >
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </Button>

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
                  disabled={saving}
                  className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDisableAutoUpdateConfirm}
        onOpenChange={setShowDisableAutoUpdateConfirm}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable automatic updates?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              Turning updates off can leave you on incompatible builds and may break login, realtime,
              and voice features over time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Keep enabled
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDisableAutoUpdateConfirmed()}
              className="bg-[#b74a56] hover:bg-[#a6424d] text-white"
            >
              Disable updates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

