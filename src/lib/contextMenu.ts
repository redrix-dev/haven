import type { ContextMenuIntent, EntityMenuScope } from '@/lib/contextMenu/types';

const MENU_SCOPE_ATTRIBUTE = 'data-menu-scope';
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], [role="textbox"]';

const scopeToIntent: Record<EntityMenuScope, ContextMenuIntent> = {
  profile: 'entity_profile',
  message: 'entity_message',
  channel: 'entity_channel',
  server: 'entity_server',
};

const getSelectedText = (): string => {
  if (typeof window === 'undefined') return '';
  return window.getSelection?.()?.toString()?.trim() ?? '';
};

const resolveEntityContextIntent = (target: Element): ContextMenuIntent => {
  const scopedElement = target.closest(`[${MENU_SCOPE_ATTRIBUTE}]`);
  if (!scopedElement) return 'none';

  const scope = scopedElement.getAttribute(MENU_SCOPE_ATTRIBUTE) as EntityMenuScope | null;
  if (!scope || !scopeToIntent[scope]) return 'none';

  return scopeToIntent[scope];
};

export const resolveContextMenuIntent = (target: EventTarget | null): ContextMenuIntent => {
  if (getSelectedText().length > 0) {
    return 'native_text';
  }

  if (!(target instanceof Element)) {
    return 'none';
  }

  if (target.closest(EDITABLE_SELECTOR)) {
    return 'native_text';
  }

  return resolveEntityContextIntent(target);
};

export const shouldUseNativeTextContextMenu = (target: EventTarget | null): boolean =>
  resolveContextMenuIntent(target) === 'native_text';
