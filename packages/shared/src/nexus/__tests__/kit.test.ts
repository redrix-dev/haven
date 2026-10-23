import { describe, expect, it, vi } from "vitest";
import { createLoadGate, isFresh } from "../kit/loadGate";
import { createPlainStatePort } from "../kit/statePort";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createLoadGate", () => {
  it("shares one in-flight load per key", async () => {
    const gate = createLoadGate();
    const task = vi.fn(async () => "done");

    const [a, b] = [gate.run("k", task), gate.run("k", task)];

    expect(a).toBe(b);
    await expect(a).resolves.toBe("done");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs separate keys independently", async () => {
    const gate = createLoadGate();
    const task = vi.fn(async () => undefined);

    await Promise.all([gate.run("a", task), gate.run("b", task)]);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("frees the key once the load settles, so the next run fires again", async () => {
    const gate = createLoadGate();
    const task = vi.fn(async () => undefined);

    await gate.run("k", task);
    expect(gate.isRunning("k")).toBe(false);
    await gate.run("k", task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("frees the key after a failure and passes the error through", async () => {
    const gate = createLoadGate();

    await expect(
      gate.run("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(gate.isRunning("k")).toBe(false);
  });

  it("a load cleared away cannot evict the newer load that replaced it", async () => {
    const gate = createLoadGate();
    const first = deferred<void>();
    const second = deferred<void>();

    const p1 = gate.run("k", () => first.promise);
    gate.clear();
    const p2 = gate.run("k", () => second.promise);

    first.resolve();
    await p1;
    // The stale load finishing must not drop the live one: a third caller
    // still joins p2 instead of firing a duplicate request.
    expect(gate.isRunning("k")).toBe(true);
    expect(gate.run("k", async () => undefined)).toBe(p2);

    second.resolve();
    await p2;
    expect(gate.isRunning("k")).toBe(false);
  });

  it("marks a load stale once clear() runs, and only that load", async () => {
    const gate = createLoadGate();
    const first = deferred<void>();
    const second = deferred<void>();
    const seen: Record<string, boolean> = {};

    const p1 = gate.run("k", async (stale) => {
      await first.promise;
      seen.first = stale();
    });
    gate.clear();
    const p2 = gate.run("k", async (stale) => {
      await second.promise;
      seen.second = stale();
    });

    first.resolve();
    second.resolve();
    await Promise.all([p1, p2]);
    expect(seen).toEqual({ first: true, second: false });
  });
});

describe("isFresh", () => {
  it("is true only inside the window after a real load", () => {
    expect(isFresh(0, 60_000, 1_000)).toBe(false);
    expect(isFresh(1_000, 60_000, 30_000)).toBe(true);
    expect(isFresh(1_000, 60_000, 61_000)).toBe(false);
  });
});

describe("createPlainStatePort", () => {
  it("merges top-level keys and replaces state on every set", () => {
    const port = createPlainStatePort({ a: 1, b: { x: 1 } });
    const before = port.get();

    port.set({ a: 2 });

    expect(port.get()).toEqual({ a: 2, b: { x: 1 } });
    expect(port.get()).not.toBe(before);
    expect(port.get().b).toBe(before.b);
  });
});
