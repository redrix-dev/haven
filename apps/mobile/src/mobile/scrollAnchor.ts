const NEAR_BOTTOM_THRESHOLD_PX = 32;

export function getBottomScrollTop(node: HTMLDivElement): number {
  return Math.max(0, node.scrollHeight - node.clientHeight);
}

export function isNearBottom(node: HTMLDivElement): boolean {
  const offset = getBottomScrollTop(node) - node.scrollTop;
  return offset <= NEAR_BOTTOM_THRESHOLD_PX;
}

export function scrollToBottom(
  node: HTMLDivElement,
  options?: { behavior?: ScrollBehavior }
): void {
  const top = getBottomScrollTop(node);

  if (typeof node.scrollTo === 'function') {
    try {
      node.scrollTo({ top, behavior: options?.behavior ?? 'auto' });
      return;
    } catch {
      // Fall through to scrollTop assignment for test doubles and older engines.
    }
  }

  node.scrollTop = top;
}

export function scrollToBottomIfNear(node: HTMLDivElement | null): void {
  if (!node) return;
  if (isNearBottom(node)) {
    scrollToBottom(node);
  }
}
