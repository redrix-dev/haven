import { batch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { StatePort } from "@shared/nexus/kit/statePort";

/** A state port backed by a Solid store, plus the live proxy for bindings. */
export type SolidStatePort<S extends object> = StatePort<S> & {
  /**
   * The live store proxy — the same object `get()` returns. Bindings hold it
   * and read it inside a tracking scope (`createMemo`, a component) to
   * subscribe to exactly the fields read.
   */
  readonly tracked: S;
};

/**
 * Solid's state port.
 *
 * Reads: `get()` is the live store proxy. Shared getters such as
 * `getPermissions()` or `getSnapshot()` therefore stay reactive when a Solid
 * component or memo calls them, exactly as the per-platform nexuses did.
 *
 * Writes: shared nexus code builds a whole next value
 * (`{ ...entities, [id]: entry }`) and hands it to `set`. Writing that object
 * straight in would replace the store node and wake every reader of it, which
 * re-ran every open channel on every message write. Instead each key is
 * `reconcile`d: Solid unwraps any proxies in the value, diffs it against the
 * store, keeps unchanged nodes, morphs changed ones in place and notifies only
 * the leaves that differ. One edited message updates one row's text; it does
 * not remount the row or re-run other channels.
 *
 * Because reconcile morphs store nodes in place, a value passed to `set`
 * becomes store-owned. Never seed or write shared constants (a module-level
 * `EMPTY` array or default object) — the store could mutate them for everyone.
 *
 * Reconcile matches array items by their `id` field. Rows identified by
 * another field name it in `keys` (voice participants use `userId`);
 * otherwise items are matched by position, and removing one row would morph
 * every row after it into its neighbour instead of removing a single row.
 */
export function createSolidStatePort<S extends object>(
  initial: S,
  options: { keys?: Partial<Record<keyof S, string>> } = {},
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
    get: () => state,
    set: (partial) => {
      batch(() => {
        for (const key of Object.keys(partial) as (keyof S & string)[]) {
          const itemKey = options.keys?.[key] ?? "id";
          setKey(key, reconcile(partial[key] as never, { key: itemKey }));
        }
      });
    },
  };
}
