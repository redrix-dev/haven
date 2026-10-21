import { batch } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { StatePort } from "@shared/nexus/kit/statePort";

/** A state port backed by a Solid store, plus the tracked proxy for bindings. */
export type SolidStatePort<S extends object> = StatePort<S> & {
  /**
   * The live store proxy. Read it inside a tracking scope (`createMemo`,
   * a component) to subscribe to exactly the fields read. Bindings only —
   * nexus logic goes through `get`/`set`.
   */
  readonly tracked: S;
};

/**
 * Turns the shared nexus's immutable writes into fine-grained Solid updates.
 *
 * Shared nexus code builds a whole next value (`{ ...entities, [id]: entry }`)
 * and hands it to `set`. Writing that object straight in would replace the
 * store node, waking every reader of it — that was the old behaviour, and it
 * re-ran every open channel on every message write. Instead each key is
 * `reconcile`d: Solid diffs the new value against the store, keeps unchanged
 * nodes, morphs changed ones in place and notifies only the leaves that
 * actually differ. One edited message updates one row's text; it does not
 * remount the row or re-run other channels.
 *
 * Because reconcile morphs store nodes in place, a value passed to `set`
 * becomes store-owned. Never seed or write shared constants (a module-level
 * `EMPTY` array or default object) — the store could mutate them for everyone.
 */
export function createSolidStatePort<S extends object>(
  initial: S,
): SolidStatePort<S> {
  const [state, setState] = createStore<S>(initial);
  // The store setter's overloads can't be indexed by a dynamic key; this is
  // the one place that needs the loose signature.
  const setKey = setState as unknown as (
    key: string,
    value: ReturnType<typeof reconcile>,
  ) => void;

  return {
    tracked: state,
    get: () => unwrap(state),
    set: (partial) => {
      batch(() => {
        for (const key of Object.keys(partial)) {
          setKey(key, reconcile(partial[key as keyof S] as never));
        }
      });
    },
  };
}
