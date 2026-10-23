/** Drop one key from a record without touching the rest. */
export function omitKey<V>(
  record: Record<string, V>,
  key: string,
): Record<string, V> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
