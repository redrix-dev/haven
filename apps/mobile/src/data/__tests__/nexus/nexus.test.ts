import { describe, expect, it } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import { Nexus } from "@mobile-data/Nexus";

type DemoRaw = { id: string; name: string };
type Demo = { id: string; displayName: string };

class DemoNexus extends Nexus<Demo, DemoRaw> {
  constructor(persistence: ReturnType<typeof createMemoryPersistence>) {
    super("demo", "global", persistence);
  }

  protected transform(raw: DemoRaw): Demo {
    return { id: raw.id, displayName: raw.name.toUpperCase() };
  }

  add(raw: DemoRaw): void {
    this.getOrCreate(raw.id, raw);
    this.persist();
  }
}

describe("Nexus base class", () => {
  it("transforms raw input on getOrCreate", () => {
    const storage = createMemoryPersistence();
    const nexus = new DemoNexus(storage);
    nexus.add({ id: "a", name: "alice" });

    expect(nexus.getSnapshot("a")).toEqual({ id: "a", displayName: "ALICE" });
  });

  it("persists and rehydrates entities across instances", () => {
    const storage = createMemoryPersistence();
    const first = new DemoNexus(storage);
    first.add({ id: "a", name: "alice" });
    first.add({ id: "b", name: "bob" });

    const second = new DemoNexus(storage);
    second.rehydrate();

    expect(second.getSnapshot("a")).toEqual({ id: "a", displayName: "ALICE" });
    expect(second.getSnapshot("b")).toEqual({ id: "b", displayName: "BOB" });
  });

  it("clear empties both the store and persistence", () => {
    const storage = createMemoryPersistence();
    const nexus = new DemoNexus(storage);
    nexus.add({ id: "a", name: "alice" });
    nexus.clear();

    const fresh = new DemoNexus(storage);
    fresh.rehydrate();
    expect(fresh.getSnapshot("a")).toBeUndefined();
  });

  it("evict removes the entry and updates persistence", () => {
    const storage = createMemoryPersistence();
    const first = new DemoNexus(storage);
    first.add({ id: "a", name: "alice" });
    first.add({ id: "b", name: "bob" });
    first.evict("a");

    const second = new DemoNexus(storage);
    second.rehydrate();
    expect(second.getSnapshot("a")).toBeUndefined();
    expect(second.getSnapshot("b")).toEqual({ id: "b", displayName: "BOB" });
  });
});
