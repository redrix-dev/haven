/**
 * The Solid port under the collections. Tier-2: the node suite's
 * `solid-js/store` is the SSR build and has no signals.
 *
 * - Reads stay live: a memo over a collection's selector re-runs when the
 *   collection writes, because `get()` is the live store proxy.
 * - Writes match: the same commands leave a Solid store and a plain one
 *   holding the same records, so Solid's reconcile is no second behaviour.
 * - Rows keyed by another field (voice rosters, `userId`) remove one row,
 *   not shift every row after it.
 */
import { describe, expect, it } from "vitest";
import { createMemo, createRoot } from "solid-js";
import { unwrap } from "solid-js/store";
import { createPlainStatePort } from "@shared/collections/kit/statePort";
import {
  createMessagesState,
  Messages,
} from "@shared/collections/messages/messages";
import { windowMessages } from "@shared/collections/messages/selectors";
import { createSolidStatePort } from "../solidStatePort";

const at = "2026-11-14T00:00:00.000Z";
const message = (n: number, body = `m${n}`) => ({
  id: `019a0000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  channel_id: "general",
  community_id: "hearth",
  author_id: "ana",
  body,
  reply_to_id: null,
  created_at: at,
  edited_at: null,
  hidden: false,
  attachments: [],
  reactions: [],
  link_preview: null,
  nonce: null,
});

const backend = {
  listMessages: async () => [message(3), message(2), message(1)],
  getMessages: async () => [],
  getLatestMessages: async () => [],
};

describe("the Solid port", () => {
  it("keeps a collection's reads live", async () => {
    const port = createSolidStatePort(createMessagesState());
    const messages = new Messages(port, backend as never);
    await messages.open("general");
    createRoot((dispose) => {
      const bodies = createMemo(() =>
        windowMessages(port.get(), "general").map((m) => m.body),
      );
      expect(bodies()).toEqual(["m1", "m2", "m3"]);
      messages.applyUpdated(message(2, "edited"));
      expect(bodies()).toEqual(["m1", "edited", "m3"]);
      messages.applyDeleted(message(1).id, "general");
      expect(bodies()).toEqual(["edited", "m3"]);
      dispose();
    });
  });

  it("holds what a plain port holds after the same commands", async () => {
    const solid = createSolidStatePort(createMessagesState());
    const plain = createPlainStatePort(createMessagesState());
    for (const port of [solid, plain]) {
      const messages = new Messages(port, backend as never);
      await messages.open("general");
      messages.applyCreated(message(4));
      messages.applyUpdated(message(3, "edited"));
      messages.applyDeleted(message(2).id, "general");
    }
    const { requests: _a, ...solidState } = unwrap(solid.get());
    const { requests: _b, ...plainState } = plain.get();
    expect(solidState).toEqual(plainState);
  });

  it("removes one row by its own key, leaving the others in place", () => {
    const port = createSolidStatePort(
      { participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }] },
      { keys: { participants: "userId" } },
    );
    const rowC = port.get().participants[2];
    port.set({ participants: [{ userId: "a" }, { userId: "c" }] });
    expect(port.get().participants.map((p) => p.userId)).toEqual(["a", "c"]);
    // Row c is the same row, not row b morphed into c.
    expect(port.get().participants[1]).toBe(rowC);
  });
});
