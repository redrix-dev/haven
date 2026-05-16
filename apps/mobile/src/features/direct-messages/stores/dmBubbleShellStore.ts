import { create } from "zustand";

/**
 * Coordinates DM bubble expand requests and collapse notifications
 * across `DMFloatingBubble` and screens that open drafts (Friends, push routing).
 */
type DmBubbleShellState = {
  expandTick: number;
  requestExpandDmBubble: () => void;
  subscribeBubbleCollapsed: (listener: () => void) => () => void;
  emitBubbleCollapsed: () => void;
};

const collapseListeners = new Set<() => void>();

export const useDmBubbleShellStore = create<DmBubbleShellState>(() => ({
  expandTick: 0,
  requestExpandDmBubble: () => {
    const { expandTick } = useDmBubbleShellStore.getState();
    useDmBubbleShellStore.setState({ expandTick: expandTick + 1 });
  },
  subscribeBubbleCollapsed: (listener) => {
    collapseListeners.add(listener);
    return () => {
      collapseListeners.delete(listener);
    };
  },
  emitBubbleCollapsed: () => {
    collapseListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore listener errors */
      }
    });
  },
}));
