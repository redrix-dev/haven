import React from 'react';
import type { MenuScope } from '@/lib/contextMenu/types';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';

interface UseSubmenuControllerOptions {
  scope: MenuScope;
  closeDelayMs?: number;
}

export function useSubmenuController({ scope, closeDelayMs = 120 }: UseSubmenuControllerOptions) {
  const [openSubmenuKey, setOpenSubmenuKey] = React.useState<string | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeAllSubmenus = React.useCallback(() => {
    clearCloseTimer();
    setOpenSubmenuKey((previousKey) => {
      if (!previousKey) return previousKey;
      traceContextMenuEvent(scope, 'submenu-close-all', { previousKey });
      return null;
    });
  }, [clearCloseTimer, scope]);

  const openSubmenu = React.useCallback(
    (key: string) => {
      clearCloseTimer();
      setOpenSubmenuKey((previousKey) => {
        if (previousKey === key) return previousKey;
        traceContextMenuEvent(scope, 'submenu-open', { key, previousKey });
        return key;
      });
    },
    [clearCloseTimer, scope]
  );

  const scheduleCloseSubmenus = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenSubmenuKey((previousKey) => {
        if (!previousKey) return previousKey;
        traceContextMenuEvent(scope, 'submenu-close-scheduled', { previousKey });
        return null;
      });
    }, closeDelayMs);
  }, [clearCloseTimer, closeDelayMs, scope]);

  const setSubmenuOpenState = React.useCallback(
    (key: string, nextOpen: boolean) => {
      if (nextOpen) {
        openSubmenu(key);
        return;
      }

      setOpenSubmenuKey((previousKey) => {
        if (previousKey !== key) return previousKey;
        traceContextMenuEvent(scope, 'submenu-close', { key });
        return null;
      });
    },
    [openSubmenu, scope]
  );

  const isSubmenuOpen = React.useCallback(
    (key: string) => openSubmenuKey === key,
    [openSubmenuKey]
  );

  React.useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  return {
    closeAllSubmenus,
    clearCloseTimer,
    isSubmenuOpen,
    openSubmenu,
    scheduleCloseSubmenus,
    setSubmenuOpenState,
  };
}
