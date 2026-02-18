import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Database } from '@/types/database';
import { getErrorMessage } from '@/shared/lib/errors';

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
        className="bg-[#18243a] border-[#142033] text-white"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Channel</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name" className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Channel Name
            </Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              className="bg-[#142033] border-[#304867] text-white"
              autoFocus
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-kind" className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Channel Type
            </Label>
            <Select value={kind} onValueChange={(value) => setKind(value as ChannelKind)}>
              <SelectTrigger id="channel-kind" className="w-full bg-[#142033] border-[#304867] text-white">
                <SelectValue placeholder="Select channel type" />
              </SelectTrigger>
              <SelectContent className="bg-[#142033] border-[#304867] text-white">
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-topic" className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Topic (Optional)
            </Label>
            <Input
              id="channel-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this channel for?"
              className="bg-[#142033] border-[#304867] text-white"
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
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

