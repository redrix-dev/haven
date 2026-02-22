import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/shared/lib/errors';

interface QuickRenameDialogProps {
  open: boolean;
  title: string;
  confirmLabel?: string;
  initialValue: string;
  maxLength?: number;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
}

export function QuickRenameDialog({
  open,
  title,
  confirmLabel = 'Save',
  initialValue,
  maxLength = 100,
  onClose,
  onConfirm,
}: QuickRenameDialogProps) {
  const [value, setValue] = React.useState(initialValue);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setError(null);
    setSaving(false);
  }, [initialValue, open]);

  const handleSave = async () => {
    const normalized = value.trim();
    if (!normalized) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(normalized);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save name.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="bg-[#18243a] border-[#304867] text-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={maxLength}
            className="bg-[#142033] border-[#304867] text-white"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
          >
            {saving ? 'Saving...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
