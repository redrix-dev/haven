import React from 'react';

const PINCH_ZOOM_LONG_PRESS_THRESHOLD = 1.01;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

function isViewportZoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > PINCH_ZOOM_LONG_PRESS_THRESHOLD;
}

export function useMobileLongPress(delayMs = 450) {
  const timerIdRef = React.useRef<number | null>(null);
  const startPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const callbackRef = React.useRef<(() => void) | null>(null);

  const cancelLongPress = React.useCallback(() => {
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }

    startPositionRef.current = null;
    callbackRef.current = null;
  }, []);

  const bind = React.useCallback(
    (onLongPress?: () => void) => ({
      onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
        cancelLongPress();

        if (!onLongPress || isViewportZoomed() || event.touches.length !== 1) {
          return;
        }

        const touch = event.touches[0];
        startPositionRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };
        callbackRef.current = onLongPress;
        timerIdRef.current = window.setTimeout(() => {
          const callback = callbackRef.current;
          cancelLongPress();
          callback?.();
        }, delayMs);
      },
      onTouchMove: (event: React.TouchEvent<HTMLElement>) => {
        if (timerIdRef.current === null || !startPositionRef.current) {
          return;
        }

        if (isViewportZoomed() || event.touches.length !== 1) {
          cancelLongPress();
          return;
        }

        const touch = event.touches[0];
        const movedTooFar =
          Math.abs(touch.clientX - startPositionRef.current.x) > LONG_PRESS_MOVE_TOLERANCE_PX
          || Math.abs(touch.clientY - startPositionRef.current.y) > LONG_PRESS_MOVE_TOLERANCE_PX;

        if (movedTooFar) {
          cancelLongPress();
        }
      },
      onTouchEnd: cancelLongPress,
      onTouchCancel: cancelLongPress,
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
        if (onLongPress) {
          event.preventDefault();
        }
      },
    }),
    [cancelLongPress, delayMs]
  );

  React.useEffect(
    () => () => {
      cancelLongPress();
    },
    [cancelLongPress]
  );

  return {
    bind,
    cancelLongPress,
  };
}
