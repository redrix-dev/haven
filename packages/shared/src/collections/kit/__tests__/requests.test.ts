import { describe, expect, it, vi } from "vitest";
import { HavenError } from "@shared/lib/backend/havenError";
import { NOT_REQUESTED, Requests, type WithRequests } from "../requests";
import { createPlainStatePort } from "../statePort";

function setup(now = () => 1_000) {
  const port = createPlainStatePort<WithRequests>({ requests: {} });
  return { port, requests: new Requests("things", port, now) };
}

/** A load that waits until the test lets it finish. */
function held() {
  let finish!: (error?: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    finish = (error) => (error ? reject(error) : resolve());
  });
  return { done, finish };
}

describe("request status", () => {
  it("is running while the load runs, then says when it finished", async () => {
    const { requests } = setup();
    const load = held();
    const running = requests.run("list", () => load.done);

    expect(requests.status("list")).toEqual({
      running: true,
      error: null,
      finishedAt: 0,
    });
    load.finish();
    await running;
    expect(requests.status("list")).toEqual({
      running: false,
      error: null,
      finishedAt: 1_000,
    });
  });

  it("keeps a failure as the status instead of rejecting", async () => {
    const { requests } = setup();
    const refusal = new HavenError("forbidden", "missing_permission", "No.");

    await expect(
      requests.run("list", () => Promise.reject(refusal)),
    ).resolves.toBeUndefined();
    expect(requests.status("list").error).toBe(refusal);
  });

  it("turns anything else thrown into an unavailable HavenError", async () => {
    const { requests } = setup();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    await requests.run("list", () => Promise.reject(new Error("boom")));

    const { error } = requests.status("list");
    expect(error).toBeInstanceOf(HavenError);
    expect(error).toMatchObject({ kind: "unavailable", message: "boom" });
    quiet.mockRestore();
  });

  it("runs one load per key, and a second caller joins it", async () => {
    const { requests } = setup();
    const load = held();
    const task = vi.fn(() => load.done);

    const first = requests.run("list", task);
    const second = requests.run("list", task);
    load.finish();
    await Promise.all([first, second]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("refreshes with a new load, and the one already running writes nothing", async () => {
    const { requests } = setup();
    const before = held();
    const wrote: string[] = [];
    const old = requests.run("list", async (stale) => {
      await before.done;
      if (!stale()) wrote.push("before");
    });
    const fresh = requests.refresh("list", async (stale) => {
      if (!stale()) wrote.push("after");
    });
    await fresh;
    before.finish();
    await old;
    expect(wrote).toEqual(["after"]);
    expect(requests.status("list").running).toBe(false);
  });

  it("writes nothing for a load that finishes after its key was forgotten", async () => {
    const { requests } = setup();
    const load = held();
    const wrote = vi.fn();
    const running = requests.run("channel:1", async (stale) => {
      await load.done;
      if (!stale()) wrote();
    });

    requests.forget("channel:1");
    load.finish();
    await running;
    expect(wrote).not.toHaveBeenCalled();
    expect(requests.status("channel:1")).toBe(NOT_REQUESTED);
  });

  it("writes nothing after the session is cleared", async () => {
    const { requests, port } = setup();
    const load = held();
    const running = requests.run("list", () => load.done);

    requests.clear();
    load.finish();
    await running;
    expect(port.get().requests).toEqual({});
  });

  it("is fresh only after a successful load inside the window", async () => {
    let now = 1_000;
    const { requests } = setup(() => now);
    expect(requests.isFresh("list", 500)).toBe(false);

    await requests.run("list", () => Promise.resolve());
    now = 1_400;
    expect(requests.isFresh("list", 500)).toBe(true);
    now = 1_600;
    expect(requests.isFresh("list", 500)).toBe(false);

    vi.spyOn(console, "error").mockImplementation(() => {});
    await requests.run("list", () => Promise.reject(new Error("down")));
    expect(requests.isFresh("list", 500)).toBe(false);
    vi.restoreAllMocks();
  });
});
