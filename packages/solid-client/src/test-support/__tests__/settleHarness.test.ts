import { describe, expect, it } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import { expectEffectSettles } from "../settleHarness";

// The self-retriggering-effect class, at the reactive-graph level. A signal
// self-write (read a(), then setA(a() + 1)) is the minimal shape that loops in
// Solid's reactive graph — it stands in for the real bug where a store read
// leaked into an effect's deps and a downstream write retriggered it.
//
// Note (from probing this env): createStore fine-grained writes do NOT loop the
// same way, so a faithful regression lock on the real DirectMessagesView effect
// needs a component-level (Tier 2) test. This file proves the harness detects
// the class and that untrack is the fix — the mechanism, not the specific site.
describe("expectEffectSettles", () => {
  it("passes for a well-behaved effect (reads one signal, writes another)", async () => {
    const result = await expectEffectSettles((track) => {
      const [id, setId] = createSignal("a");
      const [, setSeen] = createSignal("");
      createEffect(() => {
        track();
        const current = id();
        setSeen(current); // writes a DIFFERENT signal — no self-dependency
      });
      setId("b"); // one legitimate reactive change
    });
    expect(result.runs).toBeLessThanOrEqual(2);
  });

  it("DETECTS the self-retriggering class instead of hanging", async () => {
    // Without the harness's cap + dispose-break this loops forever and hangs
    // vitest. The harness must reject with a readable message instead.
    await expect(
      expectEffectSettles((track) => {
        const [value, setValue] = createSignal(0);
        createEffect(() => {
          track();
          const current = value(); // tracked read
          setValue(current + 1); // write the same signal -> retriggers forever
        });
      }),
    ).rejects.toThrow(/did not settle/);
  });

  it("proves untrack is the fix: the same shape settles once the read is untracked", async () => {
    const result = await expectEffectSettles((track) => {
      const [value, setValue] = createSignal(0);
      createEffect(() => {
        track();
        // Same read + write, but untracked, so it no longer feeds back into
        // this effect's dependencies. Remove the untrack and this test loops
        // and fails — that's the proof it detects the class.
        untrack(() => {
          const current = value();
          setValue(current + 1);
        });
      });
    });
    expect(result.runs).toBe(1);
  });
});
