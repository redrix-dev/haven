import React from 'react';
import { Button } from '@shared/app/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/app/ui/dialog';
import { Input } from '@shared/app/ui/input';
import { Label } from '@shared/app/ui/label';
import { getErrorMessage } from '@platform/lib/errors';
import { toast } from 'sonner';

type PasswordRecoveryDialogProps = {
  open: boolean;
  onCompletePasswordRecovery: (password: string) => Promise<{ error: unknown | null }>;
  onSignOut: () => Promise<void>;
};

export function PasswordRecoveryDialog({
  open,
  onCompletePasswordRecovery,
  onSignOut,
}: PasswordRecoveryDialogProps) {
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) return;
    setNewPassword('');
    setConfirmPassword('');
    setSaving(false);
    setError('');
  }, [open]);

  const handleSubmit = async () => {
    if (saving) return;
    if (!newPassword) {
      setError('New password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await onCompletePasswordRecovery(newPassword);
      if (updateError) throw updateError;
      toast.success('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Failed to update password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        // Keep this dialog controlled until password recovery completes or user signs out.
      }}
    >
      <DialogContent
        className="bg-surface-modal border-border-deep text-white sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription className="text-auth-label">
            Your reset link is verified. Set a new password to finish account recovery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="recovery-new-password" className="text-xs font-semibold text-auth-label uppercase">
              New Password
            </Label>
            <Input
              id="recovery-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="bg-surface-input border-border text-white"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery-confirm-password" className="text-xs font-semibold text-auth-label uppercase">
              Confirm Password
            </Label>
            <Input
              id="recovery-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="bg-surface-input border-border text-white"
            />
          </div>
          {error && (
            <p className="text-xs text-destructive-soft bg-destructive-surface rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void onSignOut();
            }}
            disabled={saving}
          >
            Sign Out
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="bg-primary hover:bg-primary-hover text-white"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
