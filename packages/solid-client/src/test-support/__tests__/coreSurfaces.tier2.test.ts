import { describe, expect, it } from "vitest";
import { createEffect, createSignal, untrack } from "solid-js";
import { expectRenderSettles } from "../renderSettleHarness";
import { createSolidTestCore, tid } from "../solidTestCore";

// Settle tests for the effects the screens run against the collections
// (haven-solid-reactivity). Each case is the exact call a screen makes from
// an effect that tracks only an id. Run untracked, the effect runs once for
// one setup. Run naked, the command's own store reads leak into the effect
// and its writes run it again: `NAKED_RUNS` is what that costs, measured, so
// removing the `untrack` from a screen's pattern is visible here.

type Core = ReturnType<typeof createSolidTestCore>["core"];

const file = (id: string) => ({
  id,
  bucket: "attachments",
  object_path: `m/${id}`,
  filename: null,
  mime_type: "image/png",
  size_bytes: 1,
  width: null,
  height: null,
});

/** The calls, by the screen that makes them. */
const CASES = {
  "CommunityRouteSync: open a channel": (core, id) =>
    core.openChannel("hearth", id),
  "DirectMessagesView: open a conversation": (core) =>
    core.openConversation("dm"),
  "ChannelChat: authors' profiles": (core, id) => core.profiles.ensure([id]),
  "ChannelChat: file links": (core, id) => core.attachments.ensure([file(id)]),
  "ChannelChat: replied-to messages": (core) => core.messages.ensure([tid(7)]),
  "DirectMessagesView: newest messages": (core, id) =>
    core.messages.loadLatest([id]),
  "CommunityInvitesTab: invites": (core) =>
    core.communities.loadInvites("hearth"),
  "MembersPanel: bans": (core) => core.members.loadBans("hearth"),
  "FriendsView: friend links": (core) => core.social.loadLinks(),
  "FriendLinkView: open a link": (core) => core.social.openLink("CODE234567"),
  "PeopleProvider: a card": (core, id) => core.profiles.loadCard(id),
  "ModmailView: notes": (core) => core.reports.loadNotes("report"),
  "ModmailLoader: a community's reports": (core) =>
    core.reports.loadCommunity("hearth"),
} satisfies Record<string, (core: Core, id: string) => Promise<unknown>>;

async function runsOf(
  call: (core: Core, id: string) => Promise<unknown>,
  tracked: boolean,
) {
  const { core } = createSolidTestCore();
  const result = await expectRenderSettles(
    (shouldContinue) => {
      const [id] = createSignal("general");
      createEffect(() => {
        if (!shouldContinue()) return;
        const current = id();
        if (tracked) void call(core, current).catch(() => {});
        else untrack(() => void call(core, current).catch(() => {}));
      });
      return null;
    },
    { maxRuns: 1_000, hardCap: 50 },
  );
  return result.runs;
}

describe("effects over the collections settle when untracked", () => {
  for (const [name, call] of Object.entries(CASES)) {
    it(name, async () => {
      expect(await runsOf(call, false)).toBe(1);
    });
  }
});

/**
 * Measured 2026-11-15. More than 1 means the leak is real for that call;
 * 51 is the breaker: those loop for as long as they are allowed to (loads
 * that always start fresh, `refresh`, so nothing dedupes the retrigger).
 */
const NAKED_RUNS: Record<keyof typeof CASES, number> = {
  "CommunityRouteSync: open a channel": 3,
  "DirectMessagesView: open a conversation": 3,
  "ChannelChat: authors' profiles": 3,
  "ChannelChat: file links": 2,
  "ChannelChat: replied-to messages": 3,
  "DirectMessagesView: newest messages": 2,
  "CommunityInvitesTab: invites": 2,
  "MembersPanel: bans": 2,
  "FriendsView: friend links": 51,
  "FriendLinkView: open a link": 51,
  "PeopleProvider: a card": 2,
  "ModmailView: notes": 51,
  "ModmailLoader: a community's reports": 51,
};

describe("the same calls, naked, run again on their own writes", () => {
  for (const [name, call] of Object.entries(CASES)) {
    it(
      name,
      async () => {
        expect(await runsOf(call, true)).toBe(
          NAKED_RUNS[name as keyof typeof CASES],
        );
      },
      20_000,
    );
  }
});
