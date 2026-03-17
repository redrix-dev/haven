const { DESKTOP_IPC_KEYS } = require('@platform/ipc/keys');

const CODE_TO_ACCELERATOR_KEY = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen',
  Pause: 'Pause',
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

const buildAcceleratorFromBinding = (binding) => {
  if (!binding || typeof binding !== 'object') return null;
  const code = typeof binding.code === 'string' ? binding.code.trim() : '';
  if (!code) return null;

  let key = CODE_TO_ACCELERATOR_KEY[code] ?? null;
  if (!key && /^Key[A-Z]$/.test(code)) key = code.slice(3);
  if (!key && /^Digit[0-9]$/.test(code)) key = code.slice(5);
  if (!key && /^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`;
  if (!key && /^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  if (!key) return null;

  const parts = [];
  if (binding.ctrlKey) parts.push('CommandOrControl');
  if (binding.altKey) parts.push('Alt');
  if (binding.shiftKey) parts.push('Shift');
  if (binding.metaKey) parts.push('Super');
  parts.push(key);
  return parts.join('+');
};

const describeBinding = (binding) => {
  if (!binding) return 'Unset';
  if (typeof binding.label === 'string' && binding.label.trim().length > 0) return binding.label.trim();
  return typeof binding.code === 'string' ? binding.code.trim() || 'Unset' : 'Unset';
};

const createPttShortcutManager = () => {
  const { BrowserWindow, globalShortcut } = require('electron');
  let activeAccelerator = null;
  let activeBindingCode = null;
  let pressed = false;
  let releaseTimer = null;

  const broadcastPttEvent = (payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(DESKTOP_IPC_KEYS.VOICE_PTT_EVENT, payload);
    }
  };

  const clearReleaseTimer = () => {
    if (releaseTimer == null) return;
    clearTimeout(releaseTimer);
    releaseTimer = null;
  };

  const emitPressed = (nextPressed) => {
    if (pressed === nextPressed) return;
    pressed = nextPressed;
    broadcastPttEvent({ pressed, source: 'global_shortcut' });
  };

  const unregisterCurrent = () => {
    clearReleaseTimer();
    if (activeAccelerator) globalShortcut.unregister(activeAccelerator);
    activeAccelerator = null;
    activeBindingCode = null;
    emitPressed(false);
  };

  const registerBinding = (binding) => {
    const accelerator = buildAcceleratorFromBinding(binding);
    if (!accelerator) {
      throw new Error(
        `The selected Push to Talk binding (${describeBinding(binding)}) cannot be used as a desktop global shortcut.`
      );
    }

    const registered = globalShortcut.register(accelerator, () => {
      emitPressed(true);
      clearReleaseTimer();
      releaseTimer = setTimeout(() => emitPressed(false), 900);
    });

    if (!registered) {
      throw new Error(
        `Failed to register Push to Talk binding (${describeBinding(binding)}). It may be in use by another app or blocked by OS policy.`
      );
    }

    activeAccelerator = accelerator;
    activeBindingCode = binding.code;
  };

  const updateFromVoiceSettings = (voiceSettings) => {
    if (!voiceSettings || voiceSettings.transmissionMode !== 'push_to_talk') {
      unregisterCurrent();
      return;
    }

    const binding = voiceSettings.pushToTalkBinding;
    if (!binding) {
      unregisterCurrent();
      return;
    }

    const nextAccelerator = buildAcceleratorFromBinding(binding);
    if (!nextAccelerator) {
      unregisterCurrent();
      throw new Error(
        `The selected Push to Talk binding (${describeBinding(binding)}) cannot be used as a desktop global shortcut.`
      );
    }

    if (activeAccelerator === nextAccelerator && activeBindingCode === binding.code) return;

    unregisterCurrent();
    registerBinding(binding);
  };

  return {
    updateFromVoiceSettings,
    dispose: unregisterCurrent,
  };
};

module.exports = {
  createPttShortcutManager,
  buildAcceleratorFromBinding,
};
