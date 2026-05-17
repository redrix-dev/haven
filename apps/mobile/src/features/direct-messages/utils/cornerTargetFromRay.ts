/**
 * Extracted from UX-lab FloatingDMBubble physics (reference only; ux-lab file unchanged).
 * Used by DMFloatingBubble for pan release corner targeting.
 */
export function cornerTargetFromRay(
  x0: number,
  y0: number,
  vx: number,
  vy: number,
  leftSnap: number,
  rightSnap: number,
  minY: number,
  maxY: number,
): { x: number; y: number } {
  "worklet";
  const midX = (leftSnap + rightSnap) * 0.5;
  const midY = (minY + maxY) * 0.5;
  const EPS = 1e-3;

  let bestT = Number.POSITIVE_INFINITY;
  let hit = -1;

  const tryHit = (t: number, kind: number) => {
    if (t <= EPS || t >= bestT) return;
    bestT = t;
    hit = kind;
  };

  if (Math.abs(vy) > EPS) {
    const t = (minY - y0) / vy;
    const xh = x0 + vx * t;
    if (xh >= leftSnap && xh <= rightSnap) tryHit(t, 0);
  }
  if (Math.abs(vx) > EPS) {
    const tL = (leftSnap - x0) / vx;
    const yL = y0 + vy * tL;
    if (yL >= minY && yL <= maxY) tryHit(tL, 1);
    const tR = (rightSnap - x0) / vx;
    const yR = y0 + vy * tR;
    if (yR >= minY && yR <= maxY) tryHit(tR, 2);
  }
  if (Math.abs(vy) > EPS) {
    const t = (maxY - y0) / vy;
    const xh = x0 + vx * t;
    if (xh >= leftSnap && xh <= rightSnap) tryHit(t, 3);
  }

  if (hit === 0) {
    const xh = Math.min(rightSnap, Math.max(leftSnap, x0 + vx * bestT));
    return { x: xh <= midX ? leftSnap : rightSnap, y: minY };
  }
  if (hit === 1) {
    const yh = Math.min(maxY, Math.max(minY, y0 + vy * bestT));
    return { x: leftSnap, y: yh <= midY ? minY : maxY };
  }
  if (hit === 2) {
    const yh = Math.min(maxY, Math.max(minY, y0 + vy * bestT));
    return { x: rightSnap, y: yh <= midY ? minY : maxY };
  }
  if (hit === 3) {
    const xh = Math.min(rightSnap, Math.max(leftSnap, x0 + vx * bestT));
    return { x: xh <= midX ? leftSnap : rightSnap, y: maxY };
  }

  if (Math.abs(vx) <= EPS && Math.abs(vy) <= EPS) {
    return {
      x: x0 <= midX ? leftSnap : rightSnap,
      y: y0 <= midY ? minY : maxY,
    };
  }
  if (Math.abs(vx) <= EPS) {
    return {
      x: x0 <= midX ? leftSnap : rightSnap,
      y: vy < 0 ? minY : maxY,
    };
  }
  if (Math.abs(vy) <= EPS) {
    return {
      x: vx < 0 ? leftSnap : rightSnap,
      y: y0 <= midY ? minY : maxY,
    };
  }
  if (vx >= 0) {
    return vy < 0 ? { x: rightSnap, y: minY } : { x: rightSnap, y: maxY };
  }
  return vy < 0 ? { x: leftSnap, y: minY } : { x: leftSnap, y: maxY };
}
