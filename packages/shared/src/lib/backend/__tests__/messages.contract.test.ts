import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  eventually,
  hearthChannelId,
  signOutAll,
} from "@test-support/setup/supabaseLocal";
import { HavenError, isHavenError, type HavenEvent } from "@shared/lib/backend";

const unique = () => Math.random().toString(36).slice(2, 10);

describe.sequential("messages (contract)", { timeout: 20_000 }, () => {
  afterAll(signOutAll);

  it("a message reads back the same from a page, a lookup and the realtime event", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const general = hearthChannelId("general");

    const heard: HavenEvent[] = [];
    let connected = false;
    const stop = memberB.backend.realtime.subscribeToMyEvents(memberB.id, {
      onEvent: (event) => heard.push(event),
      onConnected: () => {
        connected = true;
      },
    });
    try {
      await eventually(() => connected);
      const body = `contract ${unique()}`;
      const nonce = randomUUID();
      const sent = await memberA.backend.messages.sendMessage(general, {
        nonce,
        body,
      });
      expect(sent.body).toBe(body);
      expect(sent.author_id).toBe(memberA.id);
      expect(sent.attachments).toEqual([]);
      expect(sent.nonce).toBe(nonce);

      // The answer was lost and the app sends again: the same message back.
      const retried = await memberA.backend.messages.sendMessage(general, {
        nonce,
        body,
      });
      expect(retried.id).toBe(sent.id);

      const [first] = await memberB.backend.messages.listMessages(general, {
        limit: 1,
      });
      const [looked] = await memberB.backend.messages.getMessages([sent.id]);
      const event = await eventually(() =>
        heard.find(
          (e) => e.event === "message.created" && e.payload.id === sent.id,
        ),
      );
      expect(first).toEqual(sent);
      expect(looked).toEqual(sent);
      expect(event.payload).toEqual(sent);
    } finally {
      stop();
    }
  });

  it("pages run newest first in both directions", async () => {
    const memberA = await actor("member_a");
    const general = hearthChannelId("general");
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      ids.push(
        (
          await memberA.backend.messages.sendMessage(general, {
            nonce: randomUUID(),
            body: `page ${i}`,
          })
        ).id,
      );
    }
    const older = await memberA.backend.messages.listMessages(general, {
      before_id: ids[2],
      limit: 2,
    });
    expect(older.map((m) => m.id)).toEqual([ids[1], ids[0]]);
    const newer = await memberA.backend.messages.listMessages(general, {
      after_id: ids[0],
      limit: 2,
    });
    // The two right after ids[0], not the newest two.
    expect(newer.map((m) => m.id)).toEqual([ids[2], ids[1]]);
  });

  it("edits, reactions and deletes reach the other person", async () => {
    const memberA = await actor("member_a");
    const memberB = await actor("member_b");
    const general = hearthChannelId("general");
    const heard: HavenEvent[] = [];
    let connected = false;
    const stop = memberB.backend.realtime.subscribeToMyEvents(memberB.id, {
      onEvent: (event) => heard.push(event),
      onConnected: () => {
        connected = true;
      },
    });
    try {
      await eventually(() => connected);
      const sent = await memberA.backend.messages.sendMessage(general, {
        nonce: randomUUID(),
        body: "before",
      });
      const edited = await memberA.backend.messages.editMessage(
        sent.id,
        "after",
      );
      expect(edited.edited_at).not.toBeNull();
      await memberB.backend.messages.setReaction(sent.id, "👍", true);
      const [reacted] = await memberA.backend.messages.getMessages([sent.id]);
      expect(reacted.reactions).toEqual([
        { emoji: "👍", user_ids: [memberB.id] },
      ]);
      await memberA.backend.messages.deleteMessage(sent.id);

      const about = (name: string) =>
        heard.filter(
          (e) =>
            e.event === name && "id" in e.payload && e.payload.id === sent.id,
        );
      await eventually(() => about("message.deleted").length === 1);
      expect(about("message.updated").length).toBeGreaterThanOrEqual(2);
      expect(await memberB.backend.messages.getMessages([sent.id])).toEqual([]);
    } finally {
      stop();
    }
  });

  it("someone outside the community is told the channel does not exist", async () => {
    const stranger = await actor("non_member");
    const error = await stranger.backend.messages
      .sendMessage(hearthChannelId("general"), {
        nonce: randomUUID(),
        body: "hello?",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HavenError);
    expect(error).toMatchObject({
      kind: "not_found",
      reason: "channel_not_found",
    });
    expect(
      await stranger.backend.messages
        .listMessages(hearthChannelId("general"))
        .catch((e: unknown) => isHavenError(e, "channel_not_found")),
    ).toBe(true);
  });

  it("a member may not write in a read-only channel, and is told why", async () => {
    const memberA = await actor("member_a");
    const error = await memberA.backend.messages
      .sendMessage(hearthChannelId("read-only"), {
        nonce: randomUUID(),
        body: "nope",
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "forbidden", reason: "cannot_send" });
    expect((error as Error).message.length).toBeGreaterThan(0);
  });
});
