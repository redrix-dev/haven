import React from 'react';
import { Button } from '@/components/ui/button';
import type { VoicePushToTalkBinding } from '@/shared/desktop/types';
import { isEditableKeyboardTarget } from '@/renderer/app/utils';
import {
  createVoicePushToTalkBindingFromKeyboardEvent,
  formatVoicePushToTalkBindingLabel,
} from '@/lib/voice/pushToTalk';

type PushToTalkBindingFieldProps = {
  value: VoicePushToTalkBinding | null;
  disabled?: boolean;
  onChange: (next: VoicePushToTalkBinding | null) => void;
  className?: string;
  helperText?: string | null;
};

export function PushToTalkBindingField({
  value,
  disabled = false,
  onChange,
  className,
  helperText = null,
}: PushToTalkBindingFieldProps) {
  const [capturing, setCapturing] = React.useState(false);

  React.useEffect(() => {
    if (!capturing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setCapturing(false);
        return;
      }

      const binding = createVoicePushToTalkBindingFromKeyboardEvent(event);
      if (!binding) return;
      onChange(binding);
      setCapturing(false);
    };

    const handleWindowBlur = () => {
      setCapturing(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [capturing, onChange]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={capturing ? 'default' : 'secondary'}
          onClick={() => {
            if (disabled) return;
            setCapturing((prev) => !prev);
          }}
          disabled={disabled}
          className={capturing ? undefined : undefined}
        >
          {capturing ? 'Press a key…' : 'Set PTT Hotkey'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (disabled) return;
            onChange(null);
            setCapturing(false);
          }}
          disabled={disabled || !value}
          className="border-[#304867] text-white"
        >
          Clear
        </Button>
        <span className="rounded border border-[#304867] bg-[#111a2b] px-2 py-1 text-xs text-[#d7e4fa]">
          {capturing ? 'Listening for next key… (Esc to cancel)' : formatVoicePushToTalkBindingLabel(value)}
        </span>
      </div>
      {helperText && <p className="mt-2 text-xs text-[#8fa6c8]">{helperText}</p>}
    </div>
  );
}
