import React from 'react';

type Options = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  nearBottomThreshold?: number;
};

export function useMobileComposerViewportAnchor({ scrollRef, nearBottomThreshold = 32 }: Options) {
  const isNearBottomRef = React.useRef(true);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const handleScroll = () => {
      const offset = Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
      isNearBottomRef.current = offset <= nearBottomThreshold;
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [scrollRef, nearBottomThreshold]);

  return {
    isNearBottomRef,
    handleComposerFocus: () => {},
    handleComposerBlur: () => {},
  };
}