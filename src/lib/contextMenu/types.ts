export type EntityMenuScope = 'profile' | 'message' | 'channel' | 'server';
export type MenuScope = EntityMenuScope | 'text-native';

export type ContextMenuIntent =
  | 'native_text'
  | 'entity_profile'
  | 'entity_message'
  | 'entity_channel'
  | 'entity_server'
  | 'none';

export type MenuActionNode = MenuActionItem | MenuActionSubmenu | MenuActionSeparator;

export interface MenuActionItem {
  kind: 'item';
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface MenuActionSubmenu {
  kind: 'submenu';
  key: string;
  label: string;
  items: MenuActionNode[];
  disabled?: boolean;
}

export interface MenuActionSeparator {
  kind: 'separator';
  key: string;
}
