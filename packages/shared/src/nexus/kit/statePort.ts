/**
 * Where a nexus's state lives — the one seam between shared domain logic and a
 * platform's reactivity.
 *
 * A shared nexus never imports React, Solid or a store library. It reads and
 * writes through this port; the platform that builds the port decides how a
 * read becomes reactive:
 *
 *   - Solid: a `createStore` proxy, writes reconciled into it fine-grained
 *     (`@solid-client/data/kit/solidStatePort`).
 *   - Mobile: a vanilla zustand store the React hooks subscribe to
 *     (`@mobile-data/kit/zustandStatePort`).
 *   - Tests / headless: `createPlainStatePort` below.
 *
 * Rules for nexus code written against a port:
 *
 *   1. Write immutably. Build the next value from the current one and pass it
 *      to `set` — never mutate what `get()` returned. Unchanged entries keep
 *      their references, which is what lets both platforms skip work.
 *   2. `get()` means "read now". Never hold its result across a `set()`: one
 *      platform mutates in place and another replaces, so a held snapshot is
 *      current on one and stale on the other.
 */
export interface StatePort<S extends object> {
  /** Current state. Read it fresh; do not keep it across a `set`. */
  get(): S;
  /** Merge the given top-level keys into state. */
  set(partial: Partial<S>): void;
}

/** A non-reactive port: state is replaced on every `set`. For tests and headless use. */
export function createPlainStatePort<S extends object>(
  initial: S,
): StatePort<S> {
  let state = initial;
  return {
    get: () => state,
    set: (partial) => {
      state = { ...state, ...partial };
    },
  };
}
