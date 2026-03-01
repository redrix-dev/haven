import React from 'react';
import { useDrag } from '@use-gesture/react';

type UseMobilePullToRefreshOptions = {
  refreshing: boolean;
  onRefresh: () => void;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
};

export function useMobilePullToRefresh({
  refreshing,
  onRefresh,
  disabled = false,
  threshold = 56,
  maxPull = 72,
}: UseMobilePullToRefreshOptions) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pullDistanceRef = React.useRef(0);
  const [pullDistance, setPullDistance] = React.useState(0);

  const resetPull = React.useCallback(() => {
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const bindGesture = useDrag(
    ({ first, last, movement: [, movementY], cancel, event }) => {
      if (disabled || refreshing) {
        if (last) {
          resetPull();
        }
        return;
      }

      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      if ((first && scrollTop > 0) || (scrollTop > 0 && movementY > 0)) {
        cancel();
        resetPull();
        return;
      }

      if (movementY <= 0) {
        if (last) {
          resetPull();
        } else if (pullDistanceRef.current !== 0) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
        return;
      }

      if ('cancelable' in event && event.cancelable) {
        event.preventDefault();
      }

      const nextPullDistance = Math.min(movementY * 0.4, maxPull);
      pullDistanceRef.current = nextPullDistance;
      setPullDistance(nextPullDistance);

      if (!last) {
        return;
      }

      const shouldRefresh = nextPullDistance >= threshold;
      resetPull();
      if (shouldRefresh) {
        onRefresh();
      }
    },
    {
      axis: 'y',
      threshold: 0,
      filterTaps: true,
      pointer: {
        touch: true,
        capture: false,
        keys: false,
      },
      eventOptions: {
        passive: false,
      },
    }
  );

  return {
    scrollRef,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    showIndicator: refreshing || pullDistance > 0,
    bind: bindGesture(),
  };
}
