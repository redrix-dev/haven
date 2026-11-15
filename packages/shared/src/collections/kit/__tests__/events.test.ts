import { describe, expect, it, vi } from "vitest";
import type { HavenEvent } from "@shared/lib/backend/realtime";
import { applyEvent, type EventTable } from "../events";

/** A table where every event is ignored, to override one entry at a time. */
function ignoringAll(): Record<string, unknown> {
  return new Proxy(
    {},
    { get: () => ({ ignored: "not part of this test" }) },
  ) as Record<string, unknown>;
}

function tableWith(entries: Partial<Record<string, unknown>>): EventTable {
  const base = ignoringAll();
  return new Proxy(entries, {
    get: (target, name: string) => target[name] ?? base[name],
  }) as unknown as EventTable;
}

const deleted: HavenEvent = {
  event: "message.deleted",
  payload: { id: "m1", channel_id: "c1" },
};

describe("the event table", () => {
  it("hands each event's payload to its entry", () => {
    const onDeleted = vi.fn();
    applyEvent(tableWith({ "message.deleted": onDeleted }), deleted);
    expect(onDeleted).toHaveBeenCalledWith({ id: "m1", channel_id: "c1" });
  });

  it("does nothing for an ignored event", () => {
    expect(() => applyEvent(tableWith({}), deleted)).not.toThrow();
  });

  it("logs a handler that throws and keeps going", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const table = tableWith({
      "message.deleted": () => {
        throw new Error("bad event");
      },
    });

    expect(() => applyEvent(table, deleted)).not.toThrow();
    expect(quiet).toHaveBeenCalledOnce();
    quiet.mockRestore();
  });

  it("must name every event the database sends", () => {
    // @ts-expect-error — a table missing events does not compile.
    const partial: EventTable = { "message.deleted": () => {} };
    expect(partial).toBeDefined();
  });
});
