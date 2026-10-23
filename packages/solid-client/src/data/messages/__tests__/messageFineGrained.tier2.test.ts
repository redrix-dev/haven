/**
 * Proof: a community message write wakes only the readers of what changed.
 *
 * Runs under the Tier-2 config because the node suite resolves `solid-js/store`
 * to Solid's SSR build, which has no signals — a reactivity test there passes
 * whatever the code does. The canary below fails loudly if that ever happens.
 *
 * Rows are modelled with `mapArray`, the primitive `<For>` is built on: a row is
 * created once per distinct item reference and disposed when its item leaves.
 * "rowsCreated" after a write is therefore the number of rows `<For>` would
 * remount.
 */
import { describe, expect, it } from "vitest";
import { createComputed, createRoot, mapArray, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import { createMemoryPersistence } from "@shared/core";
import type { MessageBundle } from "@shared/lib/backend/types";
import { createSolidViewerMessagePolicyStore } from "../../session/viewerMessagePolicySessionStore";
import { CommunityMessageSolidNexus } from "../communityMessageSolidNexus";

const BASE = Date.UTC(2026, 0, 1);

const bundle = (
  id: string,
  channelId: string,
  second: number,
  overrides: Partial<MessageBundle> = {},
): MessageBundle => ({
  id,
  channelId,
  authorUserId: `author-${id}`,
  displayName: "alice",
  avatarSnapshotUrl: null,
  content: `body ${id}`,
  metadata: {},
  replyToMessageId: null,
  createdAt: new Date(BASE + second * 1000).toISOString(),
  editedAt: null,
  deletedAt: null,
  isHidden: false,
  isPlatformStaff: false,
  reactions: [],
  attachment: null,
  linkPreview: null,
  ...overrides,
});

const page = (prefix: string, channelId: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    bundle(`${prefix}${i}`, channelId, i),
  );

type Counts = {
  list: number;
  rowsCreated: number;
  content: Map<string, number>;
};

/** Mount one channel the way CommunityView does: a list memo feeding `<For>`. */
function mountChannel(list: Accessor<MessageBundle[]>) {
  const counts: Counts = { list: 0, rowsCreated: 0, content: new Map() };
  createComputed(() => {
    list();
    counts.list += 1;
  });
  const rows = mapArray(list, (message) => {
    counts.rowsCreated += 1;
    createComputed(() => {
      void message.content;
      counts.content.set(message.id, (counts.content.get(message.id) ?? 0) + 1);
    });
    return message;
  });
  createComputed(() => void rows());
  return {
    counts,
    reset() {
      counts.list = 0;
      counts.rowsCreated = 0;
      counts.content.clear();
    },
  };
}

function setup() {
  const policy = createSolidViewerMessagePolicyStore();
  const nexus = new CommunityMessageSolidNexus(
    "s1",
    createMemoryPersistence(),
    policy,
  );
  nexus.insertMessages(page("a", "A", 50), "A", {
    hasMore: false,
    cursor: null,
  });
  nexus.insertMessages(page("b", "B", 50), "B", {
    hasMore: false,
    cursor: null,
  });
  return { nexus, policy };
}

describe("canary", () => {
  it("runs against Solid's reactive client store, not the SSR build", () => {
    const [state, setState] = createStore({ n: 0 });
    let runs = 0;
    createRoot((dispose) => {
      createComputed(() => {
        void state.n;
        runs += 1;
      });
      setState("n", 1);
      dispose();
    });
    // SSR build: 1 (no signal fired). Client build: 2.
    expect(runs).toBe(2);
  });
});

describe("community message writes are fine-grained", () => {
  it("editing one message re-renders only that message", () => {
    const { nexus } = setup();
    createRoot((dispose) => {
      const a = mountChannel(nexus.channelMessages(() => "A"));
      const b = mountChannel(nexus.channelMessages(() => "B"));
      a.reset();
      b.reset();

      nexus.upsertMessage(bundle("a25", "A", 25, { content: "edited" }));

      console.info("[proof] edit one message", { a: a.counts, b: b.counts });
      expect(b.counts.list).toBe(0); // the other channel is untouched
      expect(a.counts.rowsCreated).toBe(0); // no row remounts
      expect(a.counts.content.get("a25")).toBe(1); // the edited row updates
      expect(a.counts.content.size).toBe(1); // and nothing else does
      dispose();
    });
  });

  it("a new message in one channel leaves the other channel alone", () => {
    const { nexus } = setup();
    createRoot((dispose) => {
      const a = mountChannel(nexus.channelMessages(() => "A"));
      const b = mountChannel(nexus.channelMessages(() => "B"));
      a.reset();
      b.reset();

      nexus.insertMessage(bundle("a50", "A", 50));

      console.info("[proof] new message", { a: a.counts, b: b.counts });
      expect(b.counts.list).toBe(0);
      expect(a.counts.rowsCreated).toBe(1); // only the new row mounts
      expect(a.counts.content.size).toBe(1); // existing rows don't re-run
      dispose();
    });
  });

  it("a write in another channel does not re-run this channel's visible list", () => {
    const { nexus } = setup();
    createRoot((dispose) => {
      let visibleRuns = 0;
      const visible = nexus.visibleChannelMessages(() => "A");
      createComputed(() => {
        visible();
        visibleRuns += 1;
      });
      visibleRuns = 0;

      nexus.upsertMessage(bundle("b10", "B", 10, { content: "edited in B" }));

      console.info("[proof] cross-channel visible runs", visibleRuns);
      expect(visibleRuns).toBe(0);
      dispose();
    });
  });

  it("a block (policy push) still re-filters the visible list", () => {
    const { nexus, policy } = setup();
    createRoot((dispose) => {
      const visible = nexus.visibleChannelMessages(() => "A");
      expect(visible()).toHaveLength(50);

      policy.setState({
        hiddenAuthorIds: new Set(["author-a3"]),
      });

      expect(visible().map((m) => m.id)).not.toContain("a3");
      dispose();
    });
  });
});
