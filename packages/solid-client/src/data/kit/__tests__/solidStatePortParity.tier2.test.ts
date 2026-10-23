/**
 * The Solid port must be semantically invisible: driving the same nexus through
 * the reconcile-backed Solid port and through the plain reference port must
 * leave identical state after every operation.
 *
 * `reconcile` diffs and morphs in place, so this is where id arrays being
 * reordered, spliced or emptied would go wrong if they were going to.
 *
 * Tier-2 because the node suite's `solid-js/store` is the SSR build, whose
 * `reconcile` is a shallow copy — parity there would prove nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unwrap } from "solid-js/store";
import { createMemoryPersistence } from "@shared/core";
import type { MessageBundle } from "@shared/lib/backend/types";
import { createPlainStatePort } from "@shared/nexus/kit/statePort";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
} from "@shared/nexus/messages/communityMessageNexus";
import {
  SocialNexus,
  createInitialSocialState,
} from "@shared/nexus/social/socialNexus";
import { CommunityMessageSolidNexus } from "../../messages/communityMessageSolidNexus";
import { SocialSolidNexus } from "../../social/socialSolidNexus";
import { createSolidViewerMessagePolicyStore } from "../../session/viewerMessagePolicySessionStore";

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

function messagePair() {
  const referencePort = createPlainStatePort(
    createInitialCommunityMessageState(),
  );
  const reference = new CommunityMessageNexus(
    "s1",
    referencePort,
    createMemoryPersistence(),
  );
  const solid = new CommunityMessageSolidNexus(
    "s1",
    createMemoryPersistence(),
    createSolidViewerMessagePolicyStore(),
  );
  const apply = (op: (nexus: CommunityMessageNexus) => void) => {
    op(reference);
    op(solid);
    expect(unwrap(solid.state)).toEqual(referencePort.get());
  };
  return { apply, solid, referencePort };
}

describe("Solid port parity with the reference port", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("community messages: every write lands on identical state", () => {
    const { apply, solid } = messagePair();
    const page = Array.from({ length: 10 }, (_, i) => bundle(`m${i}`, "A", i));

    apply((n) => n.insertMessages(page, "A", { hasMore: true, cursor: "m0" }));
    apply((n) => n.insertMessage(bundle("m10", "A", 10))); // append
    apply((n) => n.insertMessage(bundle("m5b", "A", 5.5))); // splice into the middle
    apply((n) => n.upsertMessage(bundle("m2", "A", 20))); // move from front to end
    apply((n) => n.upsertMessage(bundle("m7", "A", 7, { content: "edited" })));
    apply((n) => n.removeMessage("m4", "A")); // remove from the middle
    apply((n) => n.updateMessage("m1", { content: "patched" }));
    apply((n) =>
      n.insertMessage(bundle("m3", "A", 3, { content: "echo — must not win" })),
    ); // already cached: kept as-is
    apply((n) =>
      n.insertMessages([bundle("b0", "B", 0), bundle("b1", "B", 1)], "B", {
        hasMore: false,
        cursor: null,
      }),
    );
    apply((n) => n.evictChannel("A")); // empty an array
    apply((n) => n.insertMessage(bundle("m11", "A", 11))); // refill it
    apply((n) => n.clear());

    expect(unwrap(solid.state).byChannel).toEqual({});
  });

  it("community messages: rehydrate from the same payload lands on identical state", () => {
    const persistence = createMemoryPersistence();
    const writer = new CommunityMessageNexus(
      "s1",
      createPlainStatePort(createInitialCommunityMessageState()),
      persistence,
    );
    writer.insertMessages([bundle("m0", "A", 0), bundle("m1", "A", 1)], "A", {
      hasMore: false,
      cursor: null,
    });

    const referencePort = createPlainStatePort(
      createInitialCommunityMessageState(),
    );
    new CommunityMessageNexus("s1", referencePort, persistence).rehydrate();
    const solid = new CommunityMessageSolidNexus(
      "s1",
      persistence,
      createSolidViewerMessagePolicyStore(),
    );
    solid.rehydrate();

    expect(unwrap(solid.state)).toEqual(referencePort.get());
  });

  it("social: load, block and unblock land on identical state", async () => {
    let myBlocks = ["x"];
    const backend = {
      getSocialCounts: vi.fn(async () => ({
        friendsCount: 1,
        incomingPendingRequestCount: 0,
        outgoingPendingRequestCount: 0,
        blockedUserCount: myBlocks.length,
      })),
      listMyBlocks: vi.fn(async () => [...myBlocks]),
      listUsersBlockingMe: vi.fn(async () => ["y"]),
      listFriends: vi.fn(async () => []),
      listFriendRequests: vi.fn(async () => []),
      listBlockedUsers: vi.fn(async () => []),
      blockUser: vi.fn(async (id: string) => {
        myBlocks = [...myBlocks, id];
        return true;
      }),
      unblockUser: vi.fn(async (id: string) => {
        myBlocks = myBlocks.filter((b) => b !== id);
        return true;
      }),
    } as never;

    const referencePort = createPlainStatePort(createInitialSocialState());
    const reference = new SocialNexus(referencePort, backend);
    const solid = new SocialSolidNexus(backend);

    for (const step of [
      (n: SocialNexus) => n.load(),
      (n: SocialNexus) => n.blockUser("z"),
      (n: SocialNexus) => n.unblockUser("x"),
    ]) {
      const blocksBefore = myBlocks;
      await step(reference);
      myBlocks = blocksBefore; // replay the same backend state for the second nexus
      await step(solid);
      expect(unwrap(solid.state)).toEqual(referencePort.get());
    }
  });
});
