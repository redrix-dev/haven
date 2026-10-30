import { describe, beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  getFixtureChannelByName,
  getFixtureCommunityByName,
  resetFixtureDomainState,
  signInAsTestUser,
  signOutTestUser,
  testBackends,
} from "@test-support/setup/supabaseLocal";
import { MessageWriteRefusedError } from "../communityData/communityMessageBackend";

/**
 * The message part against the real database: what a page returns, and who
 * may edit or delete a message. RLS refuses an edit or delete by matching no
 * rows; the backend turns that into MessageWriteRefusedError, and nothing
 * changes.
 */
describe.sequential("CommunityMessageBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();
  const backend = testBackends.communityData;
  let communityId = "";
  let channelId = "";

  const send = async (content: string) =>
    (await backend.sendUserMessage({ communityId, channelId, content })).id;
  const read = (messageId: string) =>
    backend.getChannelMessage({ communityId, channelId, messageId });

  beforeAll(async () => {
    const community = await getFixtureCommunityByName();
    communityId = community.id;
    channelId = (
      await getFixtureChannelByName({ communityId, name: "general" })
    ).id;
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser("member_a");
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  it("a sent message comes back as a bundle from the page and by id", async () => {
    const id = await send("contract: hello");

    const page = await backend.listChannelMessages({ communityId, channelId });
    const fromPage = page.messages.find((m) => m.id === id);
    expect(fromPage).toMatchObject({
      channelId,
      authorUserId: users.member_a.id,
      content: "contract: hello",
      editedAt: null,
      deletedAt: null,
      reactions: [],
      attachment: null,
    });
    expect(await read(id)).toMatchObject({ id, content: "contract: hello" });
  });

  it("pages oldest-first windows back with a (createdAt, id) cursor", async () => {
    const ids = [];
    for (const n of [1, 2, 3]) ids.push(await send(`contract: page ${n}`));

    const first = await backend.listChannelMessages({
      communityId,
      channelId,
      limit: 2,
    });
    expect(first.hasMore).toBe(true);
    const oldest = first.messages.reduce((a, b) =>
      a.createdAt <= b.createdAt ? a : b,
    );
    const rest = await backend.listChannelMessages({
      communityId,
      channelId,
      limit: 2,
      beforeCreatedAt: oldest.createdAt,
      beforeMessageId: oldest.id,
    });

    const seen = [...first.messages, ...rest.messages].map((m) => m.id);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(rest.hasMore).toBe(false);
  });

  it("the author can edit: content changes and editedAt is set", async () => {
    const id = await send("contract: before edit");

    await backend.editUserMessage({
      communityId,
      messageId: id,
      content: "contract: after edit",
    });

    const edited = await read(id);
    expect(edited?.content).toBe("contract: after edit");
    expect(edited?.editedAt).not.toBeNull();
  });

  it("another member's edit is refused with an error and changes nothing", async () => {
    const id = await send("contract: not yours");

    await signInAsTestUser("member_b");
    await expect(
      backend.editUserMessage({
        communityId,
        messageId: id,
        content: "hijack",
      }),
    ).rejects.toBeInstanceOf(MessageWriteRefusedError);

    expect((await read(id))?.content).toBe("contract: not yours");
  });

  it("a member without manage_messages is refused deleting someone else's message", async () => {
    const id = await send("contract: keep me");

    await signInAsTestUser("member_b");
    await expect(
      backend.deleteMessage({ communityId, messageId: id }),
    ).rejects.toBeInstanceOf(MessageWriteRefusedError);

    expect(await read(id)).not.toBeNull();
  });

  it("the author, and a moderator, can delete", async () => {
    const own = await send("contract: mine to delete");
    const moderated = await send("contract: a moderator deletes this");

    await backend.deleteMessage({ communityId, messageId: own });
    expect(await read(own)).toBeNull();

    await signInAsTestUser("server_mod");
    await backend.deleteMessage({ communityId, messageId: moderated });
    expect(await read(moderated)).toBeNull();
  });

  it("toggling a reaction adds it, toggling again removes it", async () => {
    const id = await send("contract: react to me");
    const toggle = () =>
      backend.toggleMessageReaction({
        communityId,
        channelId,
        messageId: id,
        emoji: "👍",
      });

    await toggle();
    expect((await read(id))?.reactions).toEqual([
      expect.objectContaining({ emoji: "👍", userId: users.member_a.id }),
    ]);

    await toggle();
    expect((await read(id))?.reactions).toEqual([]);
  });
});
