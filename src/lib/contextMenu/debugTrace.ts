import type { MenuScope } from '@/lib/contextMenu/types';

declare global {
  interface Window {
    __HAVEN_CONTEXT_MENU_DEBUG__?: boolean;
    __HAVEN_PROMPT_TRAP_INSTALLED__?: boolean;
    __HAVEN_ORIGINAL_PROMPT__?: typeof window.prompt;
  }
}

type TraceDetails = Record<string, unknown> | undefined;

const isProduction = (): boolean =>
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

const getLocalStorageDebugFlag = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem('haven:debug:context-menu') === '1';
  } catch {
    return false;
  }
};

export const isContextMenuDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isProduction()) return false;
  if (window.__HAVEN_CONTEXT_MENU_DEBUG__ === true) return true;
  return getLocalStorageDebugFlag();
};

export const traceContextMenuEvent = (
  scope: MenuScope,
  eventName: string,
  details?: TraceDetails
): void => {
  if (!isContextMenuDebugEnabled()) return;

  if (details) {
    console.debug(`[context-menu:${scope}] ${eventName}`, details);
    return;
  }

  console.debug(`[context-menu:${scope}] ${eventName}`);
};

export const installPromptTrap = (): void => {
  if (typeof window === 'undefined') return;
  if (isProduction()) return;
  if (window.__HAVEN_PROMPT_TRAP_INSTALLED__) return;

  const originalPrompt = window.prompt.bind(window);
  window.__HAVEN_ORIGINAL_PROMPT__ = originalPrompt;
  window.prompt = ((...args: Parameters<typeof window.prompt>) => {
    const stack = new Error('window.prompt trap').stack;
    console.warn('[context-menu:prompt-trap] window.prompt invoked', {
      args,
      stack,
    });
    return originalPrompt(...args);
  }) as typeof window.prompt;

  window.__HAVEN_PROMPT_TRAP_INSTALLED__ = true;
  traceContextMenuEvent('text-native', 'prompt-trap-installed');
};
