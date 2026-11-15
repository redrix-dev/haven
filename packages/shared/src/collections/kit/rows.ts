/**
 * Rows by id: how every collection holds its records.
 *
 * Each helper returns the next value and leaves the one it was given alone.
 * Entries it does not touch keep their references, and when nothing changes
 * the same object comes back, so a platform store can skip the work.
 */

export type ById<R> = Readonly<Record<string, R>>;

/** Writes `rows` over what is there, each under the id `idOf` gives. */
export function putRowsBy<R>(
  byId: ById<R>,
  rows: readonly R[],
  idOf: (row: R) => string,
): ById<R> {
  if (rows.length === 0) return byId;
  const next: Record<string, R> = { ...byId };
  for (const row of rows) next[idOf(row)] = row;
  return next;
}

/** Writes `rows` over what is there, each under its own `id`. */
export function putRows<R extends { id: string }>(
  byId: ById<R>,
  rows: readonly R[],
): ById<R> {
  return putRowsBy(byId, rows, (row) => row.id);
}

/** Removes the rows with these ids. */
export function dropIds<R>(byId: ById<R>, ids: Iterable<string>): ById<R> {
  let next: Record<string, R> | null = null;
  for (const id of ids) {
    if (!(id in byId)) continue;
    next ??= { ...byId };
    delete next[id];
  }
  return next ?? byId;
}

/** Removes every row `test` picks. */
export function dropWhere<R>(
  byId: ById<R>,
  test: (row: R) => boolean,
): ById<R> {
  return dropIds(
    byId,
    Object.keys(byId).filter((id) => test(byId[id] as R)),
  );
}
