import React from 'react';
import { getBottomScrollTop } from '@mobile/mobile/scrollAnchor';

interface UseMobileScrollAnchorInput {
  dockRef?: React.RefObject<HTMLDivElement | null>;
  keyboardOpen: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  shellHeightPx: number;
}

interface UseMobileScrollAnchorResult {
  dockHeightPx: number;
  handleComposerBlur: () => void;
  handleComposerFocus: () => void;
  isNearBottomRef: React.MutableRefObject<boolean>;
}

const NEAR_BOTTOM_THRESHOLD_PX = 32;
const VIEWPORT_TRANSITION_MS = 320;

function getBottomOffset(node: HTMLDivElement): number {
  return Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
}

export function useMobileScrollAnchor({
  dockRef,
  keyboardOpen,
  scrollRef,
  shellHeightPx,
}: UseMobileScrollAnchorInput): UseMobileScrollAnchorResult {
  const [dockHeightPx, setDockHeightPx] = React.useState(0);
  const bottomOffsetRef = React.useRef(0);
  const isNearBottomRef = React.useRef(true);
  const frameIdRef = React.useRef<number | null>(null);
  const transitionTimeoutRef = React.useRef<number | null>(null);
  const transitionActiveRef = React.useRef(false);
  const previousMetricsRef = React.useRef<{
    dockHeightPx: number;
    keyboardOpen: boolean;
    shellHeightPx: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const node = dockRef?.current;

    if (!node) {
      setDockHeightPx(0);
      return;
    }

    const updateDockHeight = () => {
      setDockHeightPx(node.getBoundingClientRect().height);
    };

    updateDockHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateDockHeight);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [dockRef]);

  const syncPosition = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nextBottomOffset = getBottomOffset(node);
    bottomOffsetRef.current = nextBottomOffset;
    isNearBottomRef.current = nextBottomOffset <= NEAR_BOTTOM_THRESHOLD_PX;
  }, [scrollRef]);

  const preserveViewportPosition = React.useCallback(() => {
    frameIdRef.current = null;

    const node = scrollRef.current;
    if (!node) return;

    const nextScrollTop = Math.max(
      0,
      node.scrollHeight - node.clientHeight - bottomOffsetRef.current
    );

    if (Math.abs(node.scrollTop - nextScrollTop) > 1) {
      node.scrollTop = Math.min(nextScrollTop, getBottomScrollTop(node));
    }

    syncPosition();
  }, [scrollRef, syncPosition]);

  const clearTransition = React.useCallback(() => {
    transitionActiveRef.current = false;

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  const schedulePreserve = React.useCallback(() => {
    if (frameIdRef.current !== null) {
      window.cancelAnimationFrame(frameIdRef.current);
    }

    frameIdRef.current = window.requestAnimationFrame(preserveViewportPosition);
  }, [preserveViewportPosition]);

  const beginViewportTransition = React.useCallback(
    (snapToBottom: boolean) => {
      syncPosition();

      if (snapToBottom && isNearBottomRef.current) {
        bottomOffsetRef.current = 0;
        isNearBottomRef.current = true;
      }

      transitionActiveRef.current = true;
      schedulePreserve();

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }

      transitionTimeoutRef.current = window.setTimeout(() => {
        transitionActiveRef.current = false;
        transitionTimeoutRef.current = null;
      }, VIEWPORT_TRANSITION_MS);
    },
    [schedulePreserve, syncPosition]
  );

  const handleComposerFocus = React.useCallback(() => {
    beginViewportTransition(true);
  }, [beginViewportTransition]);

  const handleComposerBlur = React.useCallback(() => {
    beginViewportTransition(false);
  }, [beginViewportTransition]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const handleScroll = () => {
      syncPosition();
    };

    const handleViewportChange = () => {
      if (!transitionActiveRef.current) {
        return;
      }

      schedulePreserve();
    };

    const visualViewport = window.visualViewport;

    node.addEventListener('scroll', handleScroll, { passive: true });
    syncPosition();

    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      if (frameIdRef.current !== null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }

      clearTransition();
      node.removeEventListener('scroll', handleScroll);
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [clearTransition, schedulePreserve, scrollRef, syncPosition]);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const nextMetrics = { dockHeightPx, keyboardOpen, shellHeightPx };
    const previousMetrics = previousMetricsRef.current;
    previousMetricsRef.current = nextMetrics;

    if (!previousMetrics) {
      syncPosition();
      return;
    }

    const metricsChanged =
      previousMetrics.dockHeightPx !== dockHeightPx ||
      previousMetrics.keyboardOpen !== keyboardOpen ||
      previousMetrics.shellHeightPx !== shellHeightPx;

    if (!metricsChanged) {
      return;
    }

    const isInitialDockMeasurement =
      previousMetrics.dockHeightPx === 0 &&
      dockHeightPx > 0 &&
      previousMetrics.keyboardOpen === keyboardOpen &&
      previousMetrics.shellHeightPx === shellHeightPx;

    if (isInitialDockMeasurement) {
      syncPosition();
      return;
    }

    if (transitionActiveRef.current || previousMetrics.dockHeightPx !== dockHeightPx) {
      schedulePreserve();
      return;
    };

    syncPosition();
  }, [dockHeightPx, keyboardOpen, schedulePreserve, scrollRef, shellHeightPx, syncPosition]);

  return {
    dockHeightPx,
    handleComposerBlur,
    handleComposerFocus,
    isNearBottomRef,
  };
}
