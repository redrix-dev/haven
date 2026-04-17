import React, { useState } from 'react';
import { Button } from '@shared/app/ui/button';
import { Input } from '@shared/app/ui/input';
import { Label } from '@shared/app/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/app/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/app/ui/dialog';
import { Database } from '@shared/types/database';
import { getErrorMessage } from '@platform/lib/errors';

type ChannelKind = Database['public']['Enums']['channel_kind'];

interface CreateChannelModalProps {
  onClose: () => void;
  onCreate: (values: {
    name: string;
    topic: string | null;
    kind: ChannelKind;
  }) => Promise<void>;
}

export function CreateChannelModal({ onClose, onCreate }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<ChannelKind>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await onCreate({
        name: name.trim(),
        topic: topic.trim() ? topic.trim() : null,
        kind,
      });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create channel.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        className="bg-surface-legal border-border-deep text-white"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Channel</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name" className="text-xs font-semibold uppercase text-muted-foreground">
              Channel Name
            </Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              className="bg-surface-panel border-border text-white"
              autoFocus
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-kind" className="text-xs font-semibold uppercase text-muted-foreground">
              Channel Type
            </Label>
            <Select value={kind} onValueChange={(value) => setKind(value as ChannelKind)}>
              <SelectTrigger id="channel-kind" className="w-full bg-surface-panel border-border text-white">
                <SelectValue placeholder="Select channel type" />
              </SelectTrigger>
              <SelectContent className="bg-surface-panel border-border text-white">
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-topic" className="text-xs font-semibold uppercase text-muted-foreground">
              Topic (Optional)
            </Label>
            <Input
              id="channel-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this channel for?"
              className="bg-surface-panel border-border text-white"
              maxLength={200}
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
              disabled={loading || !name.trim()}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

