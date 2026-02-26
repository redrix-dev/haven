import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/shared/lib/errors';
import { getPlatformInviteInputPlaceholder } from '@/shared/platform/urls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JoinServerModalProps {
  onClose: () => void;
  onJoin: (inviteInput: string) => Promise<{ communityName: string; joined: boolean }>;
}

export function JoinServerModal({ onClose, onJoin }: JoinServerModalProps) {
  const [inviteInput, setInviteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await onJoin(inviteInput.trim());
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to join server from invite.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        className="bg-[#18243a] border-[#142033] text-white"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Join a Server</DialogTitle>
          <DialogDescription className="text-[#a9b8cf]">
            Paste an invite code or invite link to join.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-input" className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Invite
            </Label>
            <Input
              id="invite-input"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder={getPlatformInviteInputPlaceholder()}
              className="bg-[#142033] border-[#304867] text-white"
              autoFocus
              required
            />
          </div>

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
              disabled={loading || !inviteInput.trim()}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {loading ? 'Joining...' : 'Join Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

