import React from 'react';
import { useDrag } from '@use-gesture/react';

const PINCH_ZOOM_LONG_PRESS_THRESHOLD = 1.01;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

function isViewportZoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > PINCH_ZOOM_LONG_PRESS_THRESHOLD;
}

function isTouchGestureEvent(event: Event): boolean {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    return true;
  }

  return typeof PointerEvent !== 'undefined'
    && event instanceof PointerEvent
    && event.pointerType === 'touch';
}

export function useMobileLongPress(delayMs = 450) {
  const activeCancelRef = React.useRef<(() => void) | null>(null);
  const hasTriggeredRef = React.useRef(false);

  const cancelLongPress = React.useCallback(() => {
    activeCancelRef.current?.();
    activeCancelRef.current = null;
    hasTriggeredRef.current = false;
  }, []);

  const bind = useDrag(
    ({ args, active, first, last, intentional, touches, movement: [movementX, movementY], cancel, event }) => {
      const onLongPress = args?.[0] as (() => void) | undefined;
      const touchEvent = isTouchGestureEvent(event);

      if (first) {
        hasTriggeredRef.current = false;
        activeCancelRef.current = cancel;

        if (
          !touchEvent
          || isViewportZoomed()
          || touches > 1
          || (
            typeof PointerEvent !== 'undefined'
            && event instanceof PointerEvent
            && !event.isPrimary
          )
        ) {
          cancel();
          activeCancelRef.current = null;
          return;
        }
      }

      if (!touchEvent || !onLongPress) {
        if (last) {
          activeCancelRef.current = null;
          hasTriggeredRef.current = false;
        }
        return;
      }

      const movedTooFar =
        Math.abs(movementX) > LONG_PRESS_MOVE_TOLERANCE_PX
        || Math.abs(movementY) > LONG_PRESS_MOVE_TOLERANCE_PX;

      if (!hasTriggeredRef.current && (isViewportZoomed() || touches > 1 || movedTooFar)) {
        cancel();
        activeCancelRef.current = null;
        return;
      }

      if (!hasTriggeredRef.current && active && intentional) {
        hasTriggeredRef.current = true;
        activeCancelRef.current = null;
        onLongPress();
        cancel();
        return;
      }

      if (last) {
        activeCancelRef.current = null;
        hasTriggeredRef.current = false;
      }
    },
    {
      delay: delayMs,
      threshold: 0,
      filterTaps: true,
      pointer: {
        touch: true,
        capture: false,
        keys: false,
      },
    }
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
