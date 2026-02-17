import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (name: string) => Promise<any>;
}

export function CreateServerModal({ onClose, onCreate }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onCreate(name.trim());
      onClose();
    } catch (error) {
      console.error('Failed to create server:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-[#18243a] border-[#142033] text-white sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Your Server</DialogTitle>
          <DialogDescription className="text-[#a9b8cf]">
            Give your server a personality with a name. You can always change it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="server-name" className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Server Name
            </Label>
            <Input
              id="server-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Server"
              className="bg-[#142033] border-[#304867] text-white"
              autoFocus
              required
            />
          </div>

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
              disabled={loading || !name.trim()}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

