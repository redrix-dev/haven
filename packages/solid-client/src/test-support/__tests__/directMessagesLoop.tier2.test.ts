import { describe, expect, it } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import { createDirectMessageSolidNexus } from "../../data/direct-messages/directMessageSolidNexus";
import { expectRenderSettles } from "../renderSettleHarness";

// The faithful regression lock for commit 86a20e0: DirectMessagesView's effect
// calls core.directMessages.openConversation(id, { markRead: true }). That
// method reads a freshness timestamp synchronously (leaking it into the effect's
// deps) and, after its RPCs, rewrites that timestamp — so called un-untracked
// inside an effect it loops and strobes the chat pane. This test drives the REAL
// nexus method under Solid's real render scheduler; it is the only setup that
// reproduces the async loop (the reactive-graph harness cannot).

function makeNexus() {
  const mem = new Map<string, string>();
  const persistence: NexusPersistence = {
    getString: (k) => mem.get(k) ?? null,
    set: (k, v) => void mem.set(k, v),
    remove: (k) => void mem.delete(k),
  };
  const backend = {
    listConversations: async () => [],
    getOrCreateDirectConversation: async () => "conv-1",
    listMessages: async () => [],
    getMessage: async () => null,
    sendMessage: async () => ({}) as never,
    markConversationRead: async () => true,
    setConversationMuted: async () => true,
    reportMessage: async () => "report-1",
  } as unknown as DirectMessageBackend;
  return createDirectMessageSolidNexus(persistence, backend);
}

describe("DirectMessages openConversation — render-level settle (RED-50 Tier 2)", () => {
  it("REGRESSION: calling openConversation un-untracked inside an effect loops", async () => {
    // Proves the harness detects the real class. If this ever stops throwing,
    // either the harness broke or openConversation was made loop-safe internally.
    const nexus = makeNexus();
    await expect(
      expectRenderSettles((shouldContinue) => {
        const [id] = createSignal("conv-1");
        createEffect(() => {
          if (!shouldContinue()) return;
          void nexus.openConversation(id(), { markRead: true });
        });
        return null;
      }),
    ).rejects.toThrow(/did not settle/);
  });

  it("the untrack fix settles — this is the shipped DirectMessagesView pattern", async () => {
    const nexus = makeNexus();
    const result = await expectRenderSettles((shouldContinue) => {
      const [id] = createSignal("conv-1");
      createEffect(() => {
        if (!shouldContinue()) return;
        void untrack(() => nexus.openConversation(id(), { markRead: true }));
      });
      return null;
    });
    expect(result.runs).toBeLessThanOrEqual(3);
  });
});
