import { getAppHost } from "@shared/infrastructure/platform/appHost";

export function communityDisplayOrderStorageKey(userId: string): string {
  return `haven:user-${userId}:server-order`;
}

export function readCommunityDisplayOrder(userId: string): string[] | null {
  try {
    const raw =
      getAppHost().browserRuntime?.storageGetItem(
        communityDisplayOrderStorageKey(userId),
      ) ?? null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return (parsed as unknown[]).filter(
      (value): value is string => typeof value === "string",
    );
  } catch {
    return null;
  }
}

export function writeCommunityDisplayOrder(
  userId: string,
  ids: string[],
): void {
  try {
    getAppHost().browserRuntime?.storageSetItem(
      communityDisplayOrderStorageKey(userId),
      JSON.stringify(ids),
    );
  } catch {
    // Host storage may be unavailable in some contexts.
  }
}

export function clearCommunityDisplayOrder(userId: string): void {
  try {
    getAppHost().browserRuntime?.storageRemoveItem(
      communityDisplayOrderStorageKey(userId),
    );
  } catch {
    // ignore
  }
}

export function hasSameIdSequence(
  left: readonly string[] | null,
  right: readonly string[],
): boolean {
  if (!left) return right.length === 0;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/** Apply a saved id order to a list; unknown ids append in source order. */
export function applyCommunityDisplayOrder<T extends { id: string }>(
  items: readonly T[],
  displayOrderIds: readonly string[] | null,
): T[] {
  if (!displayOrderIds || displayOrderIds.length === 0) return items as T[];

  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];

  for (const id of displayOrderIds) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }

  for (const item of byId.values()) {
    ordered.push(item);
  }

  return ordered.every((item, index) => item.id === items[index]?.id)
    ? (items as T[])
    : ordered;
}
