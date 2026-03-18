import React from 'react';
import { Loader2 } from 'lucide-react';
import { getErrorMessage } from '@platform/lib/errors';
import {
  MobileScrollableBody,
  MobileSheet,
  MobileSheetFooter,
  MobileSheetHeader,
  MobileSheetTitle,
} from '@web-mobile/mobile/layout/MobileSurfacePrimitives';

type MobilePasswordRecoverySheetProps = {
  open: boolean;
  onCompletePasswordRecovery: (password: string) => Promise<{ error: unknown | null }>;
  onSignOut: () => Promise<void>;
};

export function MobilePasswordRecoverySheet({
  open,
  onCompletePasswordRecovery,
  onSignOut,
}: MobilePasswordRecoverySheetProps) {
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
      setNewPassword('');
      setConfirmPassword('');
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, 'Failed to update password.'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <MobileSheet
      open={open}
      onClose={() => {
        // Keep this sheet controlled until password recovery completes or the user signs out.
      }}
      closeOnBackdrop={false}
      label="Password Recovery"
      id="mobile-password-recovery"
      size="auto"
      className="h-auto"
    >
      <MobileSheetHeader>
        <MobileSheetTitle>Set a new password</MobileSheetTitle>
      </MobileSheetHeader>

      <MobileScrollableBody className="px-4 py-4">
        <p className="mb-4 text-sm text-[#aebad0]">
          Your reset link is verified. Set a new password to finish account recovery.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            New Password
          </span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoFocus
            autoComplete="new-password"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Confirm Password
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-xl bg-[#4a1f2c] px-3 py-2 text-xs text-[#fca5a5]">
            {error}
          </p>
        )}
      </MobileScrollableBody>

      <MobileSheetFooter className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void onSignOut();
          }}
          disabled={saving}
          className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          Sign Out
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="flex flex-1 items-center justify-center rounded-xl bg-[#3f79d8] py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
        </button>
      </MobileSheetFooter>
    </MobileSheet>
  );
}
