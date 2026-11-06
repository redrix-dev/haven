import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import { createLoadGate } from "@shared/nexus/kit/loadGate";
import { bootLogger } from "../bootLogger";
import { parsePerfLine, perfTrace } from "../perfTrace";
import { tracePersist, tracePersistence } from "../tracePersist";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

function parsedLines() {
  return perfTrace.getLines().map((line) => {
    const parsed = parsePerfLine(line);
    expect(parsed, line).not.toBeNull();
    return parsed!;
  });
}

describe("perfTrace", () => {
  beforeEach(() => {
    perfTrace.reset();
    perfTrace.enable();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    perfTrace.disable();
    perfTrace.reset();
    vi.restoreAllMocks();
  });

  it("stays silent and still runs the task while disabled", () => {
    perfTrace.disable();
    expect(perfTrace.measure("hidden", () => 7)).toBe(7);
    expect(perfTrace.getEvents()).toEqual([]);
    expect(perfTrace.getLines()).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("mirrors every emitted line to a registered sink, adding no origin itself", () => {
    const sink = vi.fn();
    const unsubscribe = perfTrace.addSink(sink);
    perfTrace.mark("js-entry");
    const line = perfTrace.getLines().slice(-1)[0]!;
    expect(sink).toHaveBeenCalledWith(line);
    // The tracer stays origin-agnostic; the mobile sink is what tags origin=js.
    expect(line).not.toContain("origin=");

    unsubscribe();
    perfTrace.mark("later");
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("keeps tracing, and runs later sinks, when a sink throws", () => {
    const thrower = vi.fn(() => {
      throw new Error("sink boom");
    });
    const after = vi.fn();
    perfTrace.addSink(thrower);
    perfTrace.addSink(after);
    expect(() => perfTrace.mark("js-entry")).not.toThrow();
    const line = perfTrace.getLines().slice(-1)[0]!;
    expect(thrower).toHaveBeenCalledWith(line);
    expect(after).toHaveBeenCalledWith(line);
  });

  it("rebuilds a boot timeline from the log lines", () => {
    let t = 0;
    perfTrace.setNow(() => t);

    perfTrace.mark("js-entry");
    t = 120;
    perfTrace.mark("app-module-evaluated");
    const boot = perfTrace.begin("bootstrap");
    t = 140;
    perfTrace.measure("rehydrate.communities", () => {
      t = 155;
    });
    t = 400;
    boot.end();
    perfTrace.mark("bootstrap-ready");
    perfTrace.flushSummary("bootstrap-ready");

    const lines = parsedLines();
    for (const call of vi.mocked(console.log).mock.calls) {
      expect(parsePerfLine(String(call[0]))).not.toBeNull();
    }

    const events = Object.fromEntries(
      lines
        .filter((line) => line.kind === "mark" || line.kind === "span")
        .map((line) => [line.name, line]),
    );
    expect(Number(events["js-entry"].elapsed)).toBe(0);
    expect(Number(events["js-entry"].delta)).toBe(0);
    expect(Number(events["app-module-evaluated"].elapsed)).toBe(120);
    expect(Number(events["app-module-evaluated"].delta)).toBe(120);
    expect(Number(events["rehydrate.communities"].duration)).toBe(15);
    expect(Number(events["rehydrate.communities"].elapsed)).toBe(155);
    expect(Number(events.bootstrap.duration)).toBe(280);
    expect(
      Number(events.bootstrap.elapsed) - Number(events.bootstrap.duration),
    ).toBe(120);

    const summary = lines.find((line) => line.kind === "summary");
    expect(summary?.name).toBe("bootstrap-ready");
    expect(Number(summary?.events)).toBe(5);
    expect(summary?.truncated).toBe("0");
    expect(summary?.open).toBe("0");

    const top = lines.filter((line) => line.kind === "summary-top");
    expect(top[0]?.name).toBe("bootstrap");
    expect(Number(top[0]?.duration)).toBe(280);
    expect(top[1]?.name).toBe("rehydrate.communities");

    const persist = lines.find((line) => line.kind === "summary-persist");
    expect(persist?.name).toBe("persist");
    expect(persist?.writes).toBe("0");
  });

  it("records a thrown task with error=1 and rethrows it", () => {
    let t = 0;
    perfTrace.setNow(() => t);
    expect(() =>
      perfTrace.measure("work", () => {
        t = 5;
        throw new Error("boom");
      }),
    ).toThrow("boom");
    const span = perfTrace.getEvents().find((event) => event.name === "work");
    expect(span?.duration).toBe(5);
    expect(span?.fields?.error).toBe(1);
  });

  it("records an async span from the clock when it settles", async () => {
    let t = 0;
    perfTrace.setNow(() => t);
    const pending = deferred<string>();
    const promise = perfTrace.measure("work", () => pending.promise);
    t = 9;
    pending.resolve("ok");
    await expect(promise).resolves.toBe("ok");
    expect(perfTrace.getEvents()[0]?.duration).toBe(9);
  });

  it("marks a name once", () => {
    expect(perfTrace.markOnce("chat-first-commit", { serverId: "s1" })).toBe(
      true,
    );
    expect(perfTrace.markOnce("chat-first-commit")).toBe(false);
    expect(perfTrace.getEvents()).toHaveLength(1);
    expect(perfTrace.getEvents()[0]?.fields?.serverId).toBe("s1");
  });

  it("freezes boot events when the first chat commit is summarized", () => {
    perfTrace.mark("js-entry");
    perfTrace.flushSummary("chat-first-commit");
    for (let i = 0; i < 5; i += 1) perfTrace.mark(`later-${i}`);
    expect(
      perfTrace.getEvents().some((event) => event.name === "js-entry"),
    ).toBe(true);
    expect(
      perfTrace.getEvents().some((event) => event.name === "later-4"),
    ).toBe(true);
  });

  it("drops the oldest boot events and says the buffer was truncated", () => {
    perfTrace.setBootCap(2);
    perfTrace.mark("a");
    perfTrace.mark("b");
    perfTrace.mark("c");
    perfTrace.flushSummary("bootstrap-ready");
    expect(perfTrace.getEvents().map((event) => event.name)).toEqual([
      "b",
      "c",
    ]);
    const summary = parsedLines().find((line) => line.kind === "summary");
    expect(summary?.truncated).toBe("1");
    expect(summary?.events).toBe("2");
  });

  it("keeps one loadgate span when a second caller joins", async () => {
    let t = 0;
    perfTrace.setNow(() => t);
    const gate = createLoadGate();
    const first = deferred<string>();
    const initial = gate.run("initial:channel-1", () => first.promise);
    const joined = gate.run("initial:channel-1", async () => "other");
    expect(joined).toBe(initial);
    expect(
      perfTrace.getEvents().filter((event) => event.name === "loadgate.join"),
    ).toHaveLength(1);
    t = 12;
    first.resolve("done");
    await expect(initial).resolves.toBe("done");

    const spans = perfTrace
      .getEvents()
      .filter((event) => event.name === "loadgate");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.duration).toBe(12);
    expect(spans[0]?.fields).toMatchObject({
      key: "initial:channel-1",
      inflight: "new",
      stale: 0,
    });
    const join = parsedLines().find((line) => line.name === "loadgate.join");
    expect(join?.key).toBe("initial:channel-1");
    expect(join?.inflight).toBe("joined");
  });

  it("records stale=1 when the load is forgotten before it checks", async () => {
    const gate = createLoadGate();
    const pending = deferred<void>();
    const running = gate.run("lost", async (stale) => {
      await pending.promise;
      expect(stale()).toBe(true);
    });
    gate.forget("lost");
    pending.resolve();
    await running;
    const span = perfTrace
      .getEvents()
      .find((event) => event.name === "loadgate");
    expect(span?.fields?.stale).toBe(1);
  });

  it("times stringify and storage separately, and only logs the slow ones", () => {
    const times = [0, 2, 2, 3, 3, 4, 10, 19, 20, 32];
    let index = 0;
    perfTrace.setNow(() => times[index++] ?? 32);

    const memory = tracePersistence(createMemoryPersistence());
    tracePersist(memory, "haven:nexus:communities:global", { ok: true });
    expect(perfTrace.getEvents().map((event) => event.name)).toEqual([]);
    expect(perfTrace.getPersistStats()).toMatchObject({
      writes: 1,
      stringifyMs: 2,
      writeMs: 1,
      slowWrites: 0,
      slowStringifies: 0,
    });
    expect(memory.getString("haven:nexus:communities:global")).toBe(
      JSON.stringify({ ok: true }),
    );

    tracePersist(memory, "haven:nexus:channels:global", { slow: true });
    const names = perfTrace.getEvents().map((event) => event.name);
    expect(names).toContain("persist.stringify");
    expect(names).toContain("persist.write");
    const stringify = perfTrace
      .getEvents()
      .find((event) => event.name === "persist.stringify");
    const write = perfTrace
      .getEvents()
      .find((event) => event.name === "persist.write");
    expect(stringify?.duration).toBe(9);
    expect(write?.duration).toBe(12);
    expect(write?.fields?.bytes).toBe(JSON.stringify({ slow: true }).length);
    expect(stringify?.fields?.key).toBe("haven:nexus:channels:global");
  });

  it("writes the same JSON when tracing is off", () => {
    perfTrace.disable();
    const memory = createMemoryPersistence();
    const value = { b: 1, a: "x" };
    tracePersist(memory, "k", value);
    expect(memory.getString("k")).toBe(JSON.stringify(value));
    expect(perfTrace.getPersistStats().writes).toBe(0);
  });

  it("forwards bootLogger marks onto the same clock", () => {
    bootLogger.mark("legacy", { count: 2 });
    expect(perfTrace.getEvents()[0]).toMatchObject({
      name: "legacy",
      fields: { count: 2 },
    });
  });

  it("rejects a line that is not a haven-perf record", () => {
    expect(parsePerfLine("not a trace")).toBeNull();
    expect(parsePerfLine("[haven-perf] kind-only")).toBeNull();
  });

  it("parses a native span without treating it as JS elapsed time", () => {
    expect(
      parsePerfLine(
        "[haven-perf] kind=span name=start-react-native duration=12.3 origin=native",
      ),
    ).toEqual({
      kind: "span",
      name: "start-react-native",
      duration: "12.3",
      origin: "native",
    });
    expect(
      parsePerfLine("haven-perf span name=start-react-native duration=12,3"),
    ).toBe(null);
  });
});

describe("mobile perf entry", () => {
  it("marks js-entry before the app module is loaded", () => {
    const source = readFileSync("apps/mobile/index.js", "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    const entry = source.indexOf('perfTrace.mark("js-entry")');
    const expo = source.indexOf("expo/src/launch/registerRootComponent");
    const app = source.indexOf('require("./App")');
    expect(entry).toBeGreaterThan(-1);
    expect(entry).toBeLessThan(expo);
    expect(expo).toBeLessThan(app);
    expect(source).toContain("perfTrace.enable()");
  });
});
