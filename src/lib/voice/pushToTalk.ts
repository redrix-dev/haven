import type { VoicePushToTalkBinding } from '@/shared/desktop/types';

const CODE_LABEL_OVERRIDES: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

const formatPrimaryKeyLabel = (event: Pick<KeyboardEvent, 'code' | 'key'>): string => {
  const code = typeof event.code === 'string' ? event.code.trim() : '';
  if (code && CODE_LABEL_OVERRIDES[code]) {
    return CODE_LABEL_OVERRIDES[code];
  }

  if (code.startsWith('Key/') || code.startsWith('Digit/')) {
    // Unused defensive branch for malformed code strings.
    return code.split('/').pop() ?? code;
  }

  if (code.startsWith('Key') && code.length > 3) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit') && code.length > 5) return code.slice(5);
  if (code.startsWith('Numpad') && code.length > 6) return `Numpad ${code.slice(6)}`;
  if (code.startsWith('F') && /^F\d{1,2}$/.test(code)) return code;

  const key = typeof event.key === 'string' ? event.key.trim() : '';
  if (key.length === 1) return key.toUpperCase();
  if (key.length > 0 && key !== 'Unidentified') return key;

  return code || 'Key';
};

export const formatVoicePushToTalkBindingLabel = (
  value:
    | Pick<
        VoicePushToTalkBinding,
        'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
      >
    | null
): string => {
  if (!value) return 'Unset';

  const primary = formatPrimaryKeyLabel({
    code: value.code,
    key: value.key ?? '',
  });

  const parts: string[] = [];
  if (value.ctrlKey) parts.push('Ctrl');
  if (value.altKey) parts.push('Alt');
  if (value.shiftKey) parts.push('Shift');
  if (value.metaKey) parts.push('Meta');
  parts.push(primary);
  return parts.join(' + ');
};

export const createVoicePushToTalkBindingFromKeyboardEvent = (
  event: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
): VoicePushToTalkBinding | null => {
  const code = typeof event.code === 'string' ? event.code.trim() : '';
  if (!code) return null;

  const binding: VoicePushToTalkBinding = {
    code,
    key: typeof event.key === 'string' && event.key.trim().length > 0 ? event.key.trim() : null,
    ctrlKey: Boolean(event.ctrlKey),
    altKey: Boolean(event.altKey),
    shiftKey: Boolean(event.shiftKey),
    metaKey: Boolean(event.metaKey),
    label: '',
  };
  binding.label = formatVoicePushToTalkBindingLabel(binding);
  return binding;
};

export const matchesVoicePushToTalkBinding = (
  event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  binding: VoicePushToTalkBinding | null
): boolean => {
  if (!binding) return false;
  return (
    event.code === binding.code &&
    Boolean(event.ctrlKey) === Boolean(binding.ctrlKey) &&
    Boolean(event.altKey) === Boolean(binding.altKey) &&
    Boolean(event.shiftKey) === Boolean(binding.shiftKey) &&
    Boolean(event.metaKey) === Boolean(binding.metaKey)
  );
};
