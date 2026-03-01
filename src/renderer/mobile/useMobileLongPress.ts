import React from 'react';

const PINCH_ZOOM_LONG_PRESS_THRESHOLD = 1.01;

function isViewportZoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > PINCH_ZOOM_LONG_PRESS_THRESHOLD;
}

export function useMobileLongPress(delayMs = 450) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTouchPointersRef = React.useRef(new Set<number>());

  const clearTimer = React.useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>, onLongPress: () => void) => {
      if (event.pointerType !== 'touch') return;

      activeTouchPointersRef.current.add(event.pointerId);
      clearTimer();

      if (!event.isPrimary || activeTouchPointersRef.current.size > 1 || isViewportZoomed()) {
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;

        if (activeTouchPointersRef.current.size !== 1 || isViewportZoomed()) {
          return;
        }

        onLongPress();
      }, delayMs);
    },
    [clearTimer, delayMs]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      if (activeTouchPointersRef.current.size > 1 || isViewportZoomed()) {
        clearTimer();
      }
    },
    [clearTimer]
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;

      activeTouchPointersRef.current.delete(event.pointerId);
      clearTimer();
    },
    [clearTimer]
  );

  React.useEffect(
    () => () => {
      clearTimer();
      activeTouchPointersRef.current.clear();
    },
    [clearTimer]
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerLeave: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    cancelLongPress: clearTimer,
  };
}
