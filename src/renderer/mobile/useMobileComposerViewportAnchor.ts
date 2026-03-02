import React from 'react';

type UseMobileComposerViewportAnchorOptions = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  nearBottomThreshold?: number;
  transitionMs?: number;
};

function getBottomOffset(node: HTMLDivElement): number {
  return Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
}

export function useMobileComposerViewportAnchor({
  scrollRef,
  nearBottomThreshold = 32,
  transitionMs = 320,
}: UseMobileComposerViewportAnchorOptions) {
  const bottomOffsetRef = React.useRef(0);
  const isNearBottomRef = React.useRef(true);
  const frameIdRef = React.useRef<number | null>(null);
  const transitionTimeoutRef = React.useRef<number | null>(null);
  const transitionActiveRef = React.useRef(false);

  const syncPosition = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    const nextBottomOffset = getBottomOffset(node);
    bottomOffsetRef.current = nextBottomOffset;
    isNearBottomRef.current = nextBottomOffset <= nearBottomThreshold;
  }, [nearBottomThreshold, scrollRef]);

  const preserveViewportPosition = React.useCallback(() => {
    frameIdRef.current = null;

    const node = scrollRef.current;
    if (!node) return;

    const nextScrollTop = Math.max(
      0,
      node.scrollHeight - node.clientHeight - bottomOffsetRef.current
    );

    if (Math.abs(node.scrollTop - nextScrollTop) > 1) {
      node.scrollTop = nextScrollTop;
    }

  }, [scrollRef]);

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

  const beginViewportTransition = React.useCallback((snapToBottom: boolean) => {
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
    }, transitionMs);
  }, [schedulePreserve, syncPosition, transitionMs]);

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

  return {
    handleComposerBlur,
    handleComposerFocus,
    isNearBottomRef,
  };
}
