// Changed: simplify viewport anchoring to scroll-only near-bottom tracking and add dev instrumentation for transition calls.
import React from 'react';

type UseMobileComposerViewportAnchorOptions = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  nearBottomThreshold?: number;
};

function getBottomOffset(node: HTMLDivElement): number {
  return Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
}

export function useMobileComposerViewportAnchor({
  scrollRef,
  nearBottomThreshold = 32,
}: UseMobileComposerViewportAnchorOptions) {
  // Decision: visualViewport listeners were removed. Current mobile layout uses static composer + dvh,
  // so scroll-only near-bottom tracking is sufficient and avoids overcorrecting native scroll restoration.
  const bottomOffsetRef = React.useRef(0);
  const isNearBottomRef = React.useRef(true);

  const syncPosition = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    const nextBottomOffset = getBottomOffset(node);
    bottomOffsetRef.current = nextBottomOffset;
    isNearBottomRef.current = nextBottomOffset <= nearBottomThreshold;
  }, [nearBottomThreshold, scrollRef]);

  const beginViewportTransition = React.useCallback((snapToBottom: boolean) => {
    syncPosition();

    if (process.env.NODE_ENV !== 'production') {
      console.groupCollapsed('[useMobileComposerViewportAnchor] beginViewportTransition');
      console.log('snapToBottom', snapToBottom);
      console.log('bottomOffsetRef', bottomOffsetRef.current);
      console.log('isNearBottomRef', isNearBottomRef.current);
      console.groupEnd();
    }

    if (snapToBottom && isNearBottomRef.current) {
      bottomOffsetRef.current = 0;
      isNearBottomRef.current = true;
    }
  }, [syncPosition]);

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

    node.addEventListener('scroll', handleScroll, { passive: true });
    syncPosition();

    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef, syncPosition]);

  return {
    handleComposerBlur,
    handleComposerFocus,
    isNearBottomRef,
  };
}
