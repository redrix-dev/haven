/**
 * Every id the database makes is a time-ordered UUID (version 7), written in
 * lowercase. Comparing two as text compares when they were made, the same
 * order the database sorts by. So "is this message newer than my read mark"
 * is one comparison, with no dates involved.
 */

/** True when `id` was made after `than`. Anything is newer than nothing. */
export function isNewer(id: string, than: string | null | undefined): boolean {
  return than == null || id > than;
}

/** The newer of two ids. */
export function newest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
