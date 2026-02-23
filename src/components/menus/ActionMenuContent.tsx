import React from 'react';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { MenuActionNode, MenuActionSubmenu, MenuScope } from '@/lib/contextMenu/types';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';
import { useSubmenuController } from '@/components/menus/useSubmenuController';

interface ActionMenuContentProps {
  mode: 'context' | 'dropdown';
  actions: MenuActionNode[];
  scope: MenuScope;
}

export function ActionMenuContent({ mode, actions, scope }: ActionMenuContentProps) {
  const submenuController = useSubmenuController({ scope });
  const repairStuckMenuInteractionState = React.useCallback(() => {
    const hasOpenMenu = Boolean(
      document.querySelector(
        [
          '[data-slot="dropdown-menu-content"][data-state="open"]',
          '[data-slot="dropdown-menu-sub-content"][data-state="open"]',
          '[data-slot="context-menu-content"][data-state="open"]',
          '[data-slot="context-menu-sub-content"][data-state="open"]',
        ].join(', ')
      )
    );

    if (hasOpenMenu) {
      return;
    }

    const hasOpenModalOverlay = Boolean(
      document.querySelector(
        [
          '[data-slot="dialog-overlay"][data-state="open"]',
          '[data-slot="alert-dialog-overlay"][data-state="open"]',
          '[data-slot="sheet-overlay"][data-state="open"]',
        ].join(', ')
      )
    );

    if (!hasOpenModalOverlay) {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
      if (document.documentElement.style.pointerEvents === 'none') {
        document.documentElement.style.pointerEvents = '';
      }
    }

    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }

    const activeMenuLayer = activeElement.closest(
      '[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"], [data-slot="context-menu-content"], [data-slot="context-menu-sub-content"]'
    );

    if (activeMenuLayer) {
      activeElement.blur();
    }
  }, []);

  const runAfterMenuClose = React.useCallback(
    (callback: () => void) => {
      submenuController.closeAllSubmenus();

      // Wait until Radix has closed and cleaned up its dismissable layers before
      // triggering actions that can navigate/unmount the current surface.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          repairStuckMenuInteractionState();
          callback();
          window.requestAnimationFrame(() => {
            repairStuckMenuInteractionState();
          });
        });
      });
    },
    [repairStuckMenuInteractionState, submenuController]
  );

  const renderContextNodes = React.useCallback(
    (nodes: MenuActionNode[], depth = 0): React.ReactNode =>
      nodes.map((node) => {
        if (node.kind === 'separator') {
          return <ContextMenuSeparator key={node.key} />;
        }

        if (node.kind === 'submenu') {
          return renderContextSubmenu(node, depth);
        }

        return (
          <ContextMenuItem
            key={node.key}
            disabled={node.disabled}
            variant={node.destructive ? 'destructive' : 'default'}
            onPointerMove={() => {
              traceContextMenuEvent(scope, 'pointermove-item', { key: node.key });
              if (depth === 0) {
                submenuController.closeAllSubmenus();
              }
            }}
            onSelect={() => {
              traceContextMenuEvent(scope, 'item-select', { key: node.key, label: node.label });
              runAfterMenuClose(node.onSelect);
            }}
          >
            {node.label}
          </ContextMenuItem>
        );
      }),
    [runAfterMenuClose, scope, submenuController]
  );

  const renderContextSubmenu = (node: MenuActionSubmenu, depth: number): React.ReactNode => (
    <ContextMenuSub
      key={node.key}
      open={submenuController.isSubmenuOpen(node.key)}
      onOpenChange={(nextOpen) => submenuController.setSubmenuOpenState(node.key, nextOpen)}
    >
      <ContextMenuSubTrigger
        disabled={node.disabled}
        onPointerMove={() => {
          traceContextMenuEvent(scope, 'pointermove-sub-trigger', { key: node.key });
          submenuController.openSubmenu(node.key);
        }}
        onPointerEnter={() => {
          traceContextMenuEvent(scope, 'pointerenter-sub-trigger', { key: node.key });
          submenuController.openSubmenu(node.key);
        }}
        onPointerLeave={() => {
          traceContextMenuEvent(scope, 'pointerleave-sub-trigger', { key: node.key });
          submenuController.scheduleCloseSubmenus();
        }}
      >
        {node.label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent
        className="bg-[#18243a] border-[#304867] text-white"
        onPointerEnter={() => {
          traceContextMenuEvent(scope, 'pointerenter-sub-content', { key: node.key });
          submenuController.clearCloseTimer();
        }}
        onPointerLeave={() => {
          traceContextMenuEvent(scope, 'pointerleave-sub-content', { key: node.key });
          submenuController.scheduleCloseSubmenus();
        }}
        onEscapeKeyDown={(event) => {
          traceContextMenuEvent(scope, 'keydown-escape-sub-content', { key: node.key });
          event.preventDefault();
          submenuController.closeAllSubmenus();
        }}
      >
        {renderContextNodes(node.items, depth + 1)}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );

  const renderDropdownNodes = React.useCallback(
    (nodes: MenuActionNode[], depth = 0): React.ReactNode =>
      nodes.map((node) => {
        if (node.kind === 'separator') {
          return <DropdownMenuSeparator key={node.key} />;
        }

        if (node.kind === 'submenu') {
          return renderDropdownSubmenu(node, depth);
        }

        return (
          <DropdownMenuItem
            key={node.key}
            disabled={node.disabled}
            variant={node.destructive ? 'destructive' : 'default'}
            onPointerMove={() => {
              traceContextMenuEvent(scope, 'pointermove-item', { key: node.key });
              if (depth === 0) {
                submenuController.closeAllSubmenus();
              }
            }}
            onSelect={() => {
              traceContextMenuEvent(scope, 'item-select', { key: node.key, label: node.label });
              runAfterMenuClose(node.onSelect);
            }}
          >
            {node.label}
          </DropdownMenuItem>
        );
      }),
    [runAfterMenuClose, scope, submenuController]
  );

  const renderDropdownSubmenu = (node: MenuActionSubmenu, depth: number): React.ReactNode => (
    <DropdownMenuSub
      key={node.key}
      open={submenuController.isSubmenuOpen(node.key)}
      onOpenChange={(nextOpen) => submenuController.setSubmenuOpenState(node.key, nextOpen)}
    >
      <DropdownMenuSubTrigger
        disabled={node.disabled}
        onPointerMove={() => {
          traceContextMenuEvent(scope, 'pointermove-sub-trigger', { key: node.key });
          submenuController.openSubmenu(node.key);
        }}
        onPointerEnter={() => {
          traceContextMenuEvent(scope, 'pointerenter-sub-trigger', { key: node.key });
          submenuController.openSubmenu(node.key);
        }}
        onPointerLeave={() => {
          traceContextMenuEvent(scope, 'pointerleave-sub-trigger', { key: node.key });
          submenuController.scheduleCloseSubmenus();
        }}
      >
        {node.label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="bg-[#18243a] border-[#304867] text-white"
        onPointerEnter={() => {
          traceContextMenuEvent(scope, 'pointerenter-sub-content', { key: node.key });
          submenuController.clearCloseTimer();
        }}
        onPointerLeave={() => {
          traceContextMenuEvent(scope, 'pointerleave-sub-content', { key: node.key });
          submenuController.scheduleCloseSubmenus();
        }}
        onEscapeKeyDown={(event) => {
          traceContextMenuEvent(scope, 'keydown-escape-sub-content', { key: node.key });
          event.preventDefault();
          submenuController.closeAllSubmenus();
        }}
      >
        {renderDropdownNodes(node.items, depth + 1)}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  if (mode === 'context') {
    return <>{renderContextNodes(actions)}</>;
  }

  return <>{renderDropdownNodes(actions)}</>;
}
