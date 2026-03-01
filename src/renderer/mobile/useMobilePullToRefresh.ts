import React from 'react';

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
  const touchStartYRef = React.useRef<number | null>(null);
  const isPullingRef = React.useRef(false);
  const [pullDistance, setPullDistance] = React.useState(0);

  const resetPull = React.useCallback(() => {
    touchStartYRef.current = null;
    isPullingRef.current = false;
    setPullDistance(0);
  }, []);

  const handleTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || refreshing) return;
      if ((scrollRef.current?.scrollTop ?? 0) > 0) return;

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
      isPullingRef.current = true;
    },
    [disabled, refreshing]
  );

  const handleTouchMove = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || refreshing) return;
      if (!isPullingRef.current || touchStartYRef.current == null) return;
      if ((scrollRef.current?.scrollTop ?? 0) > 0) {
        resetPull();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
      const delta = currentY - touchStartYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }

      if (event.nativeEvent.cancelable) {
        event.preventDefault();
      }

      setPullDistance(Math.min(delta * 0.4, maxPull));
    },
    [disabled, maxPull, refreshing, resetPull]
  );

  const handleTouchEnd = React.useCallback(() => {
    const shouldRefresh = !disabled && !refreshing && pullDistance >= threshold;
    resetPull();
    if (shouldRefresh) {
      onRefresh();
    }
  }, [disabled, onRefresh, pullDistance, refreshing, resetPull, threshold]);

  return {
    scrollRef,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    showIndicator: refreshing || pullDistance > 0,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
  };
}
