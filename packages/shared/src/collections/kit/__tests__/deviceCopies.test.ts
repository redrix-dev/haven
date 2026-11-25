import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import {
  DeviceCopies,
  deviceKey,
  type DeviceCopy,
  type WriteScheduler,
} from "../deviceCopies";
import { createPlainStatePort } from "../statePort";

type State = { channelIds: string[]; loading: boolean };

const channels: DeviceCopy<State, string[]> = {
  name: "channels",
  version: 2,
  pick: (state) => state.channelIds,
  restore: (saved) => ({ channelIds: saved }),
};

/** Writes wait until the test calls `run()`. */
function manualScheduler() {
  let pending: (() => void) | null = null;
  let scheduled = 0;
  const schedule: WriteScheduler = (write) => {
    scheduled += 1;
    pending = write;
    return () => {
      pending = null;
    };
  };
  return {
    schedule,
    isWaiting: () => pending !== null,
    scheduled: () => scheduled,
    run: () => pending?.(),
  };
}

function setup() {
  const storage = createMemoryPersistence();
  const later = manualScheduler();
  const copies = new DeviceCopies(storage, later.schedule);
  const inner = createPlainStatePort<State>({ channelIds: [], loading: false });
  const port = copies.track(channels, inner);
  return { storage, later, copies, inner, port };
}

const key = (userId: string) => deviceKey(userId, "channels", 2);

describe("device copies", () => {
  it("writes a change a moment later, once for many changes", () => {
    const { storage, later, copies, port } = setup();
    const set = vi.spyOn(storage, "set");
    copies.open("u1");

    port.set({ channelIds: ["a"] });
    port.set({ channelIds: ["a", "b"] });
    expect(set).not.toHaveBeenCalled();
    expect(later.scheduled()).toBe(1);

    later.run();
    expect(set).toHaveBeenCalledOnce();
    expect(storage.getString(key("u1"))).toBe('["a","b"]');
  });

  it("does not rewrite a copy whose kept part did not change", () => {
    const { storage, later, copies, port } = setup();
    copies.open("u1");
    port.set({ channelIds: ["a"] });
    later.run();

    const set = vi.spyOn(storage, "set");
    port.set({ loading: true });
    later.run();
    expect(set).not.toHaveBeenCalled();
  });

  it("writes at once on flush", () => {
    const { storage, later, copies, port } = setup();
    copies.open("u1");
    port.set({ channelIds: ["a"] });

    copies.flush();
    expect(storage.getString(key("u1"))).toBe('["a"]');
    expect(later.isWaiting()).toBe(false);
  });

  it("puts a kept copy back on sign-in, under that person's key only", () => {
    const { storage, copies, inner } = setup();
    storage.set(key("u1"), '["kept"]');
    storage.set(key("u2"), '["someone else"]');

    copies.open("u1");
    expect(inner.get().channelIds).toEqual(["kept"]);
  });

  it("drops copies kept under an older version", () => {
    const { storage, copies, inner } = setup();
    storage.set(deviceKey("u1", "channels", 1), '{"old":"shape"}');

    copies.open("u1");
    expect(storage.getString(deviceKey("u1", "channels", 1))).toBeNull();
    expect(inner.get().channelIds).toEqual([]);
  });

  it("drops a copy that cannot be read back", () => {
    const { storage, copies, inner } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    storage.set(key("u1"), "{not json");

    copies.open("u1");
    expect(storage.getString(key("u1"))).toBeNull();
    expect(inner.get().channelIds).toEqual([]);
    vi.restoreAllMocks();
  });

  it("removes the person's copies on sign-out and writes nothing after", () => {
    const { storage, later, copies, port } = setup();
    copies.open("u1");
    port.set({ channelIds: ["a"] });
    copies.flush();

    port.set({ channelIds: ["a", "b"] });
    copies.close();
    expect(later.isWaiting()).toBe(false);
    later.run();
    port.set({ channelIds: ["c"] });
    copies.flush();

    expect(storage.getString(key("u1"))).toBeNull();
  });

  it("writes nothing before anyone signs in", () => {
    const { storage, later, port } = setup();
    port.set({ channelIds: ["a"] });
    later.run();
    expect(storage.getString(key("u1"))).toBeNull();
    expect(later.isWaiting()).toBe(false);
  });

  it("refuses to track one name twice", () => {
    const { copies } = setup();
    const other = createPlainStatePort<State>({
      channelIds: [],
      loading: false,
    });
    expect(() => copies.track(channels, other)).toThrow(/twice/);
  });
});
