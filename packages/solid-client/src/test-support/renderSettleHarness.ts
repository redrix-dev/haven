import type { JSX } from "solid-js";
import { render } from "@solidjs/testing-library";

/**
 * Tier-2 settle harness: catches the ASYNC store-loop class (the one that
 * strobes the UI — see the `haven-solid-reactivity` skill) by running an effect
 * under Solid's REAL client render scheduler, which the reactive-graph harness
 * (`expectEffectSettles`) cannot reproduce in isolation.
 *
 * Requires jsdom + vite-plugin-solid — run under `vitest.tier2.config.ts`
 * (file name `*.tier2.test.ts`), not the main node suite.
 *
 * `build` receives `shouldContinue`, which MUST be called at the top of the
 * effect: it counts runs and returns false past a hard cap so an async loop
 * can't run away (each loop iteration yields on an await, so a bounded number of
 * macrotask drains + this breaker guarantees no hang). Assert on the run count:
 * a settling effect runs once or twice; a looping one hits the cap.
 */
export interface RenderSettleOptions {
  /** Settle threshold: more runs than this for one setup means it looped. */
  maxRuns?: number;
  /** Breaker: stop driving the effect once it has run this many times. */
  hardCap?: number;
  /** Macrotask pumps to let an async loop reveal itself before asserting. */
  drains?: number;
}

async function drainMacrotasks(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export async function expectRenderSettles(
  build: (shouldContinue: () => boolean) => JSX.Element,
  options: RenderSettleOptions = {},
): Promise<{ runs: number }> {
  const maxRuns = options.maxRuns ?? 3;
  const hardCap = options.hardCap ?? 50;
  const drains = options.drains ?? 80;

  let runs = 0;
  const shouldContinue = () => {
    runs += 1;
    return runs <= hardCap;
  };

  const { unmount } = render(() => build(shouldContinue));
  await drainMacrotasks(drains);
  unmount();

  if (runs > maxRuns) {
    throw new Error(
      `Effect did not settle under a real render: ran ${runs}x for a single setup ` +
        `(settle threshold ${maxRuns}, breaker ${hardCap}). This is the async ` +
        `store-loop class that strobes the UI — a store read leaked into the ` +
        `effect's dependencies and an async write retriggered it. Read tracked ` +
        `values first, then wrap the store-writing call in untrack().`,
    );
  }

  return { runs };
}
