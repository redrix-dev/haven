import { createRoot } from "solid-js";

/** Sentinel thrown from `track` past the cap to unwind a synchronous loop. */
const OVERFLOW = Symbol("settle-harness-overflow");

/**
 * Test harness for the self-retriggering-effect class (see the
 * `haven-solid-reactivity` skill). An effect that reads a store and then writes
 * that same store loops forever — and it never throws, so a naive test would
 * just hang vitest until the suite timeout. This harness counts effect runs and
 * breaks the cycle past a cap, so a non-settling effect fails with a readable
 * assertion instead of a hang.
 *
 * Usage: `build` receives a `track` fn that MUST be called at the very top of
 * the effect under test, then builds the reactive graph (signals/stores +
 * `createEffect`). Trigger any reactive change inside `build` too. The harness
 * pumps microtasks so deferred effects (and any self-retriggers) actually run.
 */
export interface SettleOptions {
  /** Max times the tracked effect may run before it's judged non-settling. */
  maxRuns?: number;
  /** Microtask flushes to pump before asserting (defaults to maxRuns + 4). */
  flushes?: number;
}

export interface SettleResult {
  runs: number;
}

export async function expectEffectSettles(
  build: (track: () => void) => void,
  options: SettleOptions = {},
): Promise<SettleResult> {
  const maxRuns = options.maxRuns ?? 2;
  const flushes = options.flushes ?? maxRuns + 4;

  let runs = 0;
  let overflowed = false;
  let disposeRoot: (() => void) | null = null;

  const track = () => {
    runs += 1;
    if (runs > maxRuns) {
      overflowed = true;
      // Dispose stops a *deferred* self-retrigger from rescheduling; the throw
      // unwinds a *synchronous recursive* loop (Solid re-runs the effect nested
      // on each write, which would otherwise blow the stack past the cap). Both
      // failure modes are real — see the settle-harness tests.
      disposeRoot?.();
      throw OVERFLOW;
    }
  };

  try {
    createRoot((dispose) => {
      disposeRoot = dispose;
      build(track);
    });
  } catch (err) {
    // Once we've overflowed, any error is fallout from our break unwinding the
    // effect (Solid re-wraps the sentinel as its own error), so swallow it and
    // let the post-check below report the clean "did not settle" message. A
    // throw *before* overflow is a genuine failure in `build` — re-raise it.
    if (!overflowed) throw err;
  }

  for (let i = 0; i < flushes; i += 1) {
    await Promise.resolve();
  }

  disposeRoot?.();

  if (overflowed || runs > maxRuns) {
    throw new Error(
      `Effect did not settle: ran ${runs}x for a single setup (cap ${maxRuns}). ` +
        `This is the self-retriggering-effect class — a store read leaked into ` +
        `the effect's dependencies and a write retriggered it. Read tracked ` +
        `values first, then wrap store-writing calls in untrack().`,
    );
  }

  return { runs };
}
