const NEAR_BOTTOM_THRESHOLD_PX = 32;

export function isNearBottom(node: HTMLDivElement): boolean {
  const offset = node.scrollHeight - node.scrollTop - node.clientHeight;
  return offset <= NEAR_BOTTOM_THRESHOLD_PX;
}

export function scrollToBottomIfNear(node: HTMLDivElement | null): void {
  if (!node) return;
  if (isNearBottom(node)) {
    node.scrollTop = node.scrollHeight;
  }
}