// HavenCore: the session, the event table, and the commands that touch more
// than one collection. Real collections over a fake backend.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Backend } from "@shared/lib/backend";
import type { MessageRecord } from "@shared/lib/backend/records";
import type { CommunityStructure } from "@shared/lib/backend/communities";
import type { MyEventsOptions } from "@shared/lib/backend/realtime";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import {
  CONNECT_WAIT_MS,
  HavenCore,
  type MakePort,
  type StoreName,
} from "../core/havenCore";
import type { VoiceState } from "@shared/collections/voice/voiceState";
import { deviceKey } from "../kit/deviceCopies";
import { createPlainStatePort, type StatePort } from "../kit/statePort";
import {
  campaign,
  channel,
  community,
  communityReport,
  deferred,
  member,
  message,
  myAccount,
  notification,
  profile,
  tid,
} from "./fixtures";

const structure = (id: string): CommunityStructure => ({
  community: community(id),
  members: [
    member("me", { community_id: id }),
    member("ana", { community_id: id }),
  ],
  roles: [],
  role_permissions: [],
  member_roles: [],
  categories: [],
  collapsed_category_ids: [],
});

function setup(
  options: { storage?: ReturnType<typeof createMemoryPersistence> } = {},
) {
  let listening: MyEventsOptions | null = null;
  const stop = vi.fn();
  const b = {
    people: {
      loadMyAccount: vi.fn(async () =>
        myAccount({ onboarding: [campaign("join", { community_id: "club" })] }),
      ),
      getProfiles: vi.fn(async (ids: string[]) => ids.map((id) => profile(id))),
      getProfileCard: vi.fn(),
      updateMyProfile: vi.fn(async (changes: { username?: string }) =>
        profile("me", { username: changes.username ?? "me" }),
      ),
      answerOnboarding: vi.fn(async () => {}),
    },
    communities: {
      listMyCommunities: vi.fn(async () => [community("hearth")]),
      loadCommunity: vi.fn(async (id: string) => structure(id)),
      getMyPermissions: vi.fn(async () => [
        "view_channels",
        "manage_reports",
        "view_hidden_messages",
      ]),
      joinCommunity: vi.fn(async () => community("joined")),
      createCommunity: vi.fn(async (name: string) =>
        community("made", { name }),
      ),
      leaveCommunity: vi.fn(async () => {}),
    },
    channels: {
      deleteChannel: vi.fn(async () => {}),
      listConversations: vi.fn(async () => ({
        channels: [],
        participants: [],
      })),
      listMyChannelState: vi.fn(async () => []),
      getUnreadCounts: vi.fn(async () => []),
      listCommunityChannels: vi.fn(async (id: string) =>
        id === "hearth"
          ? [channel("general"), channel("random")]
          : [channel(`${id}-general`, { community_id: id })],
      ),
      openConversation: vi.fn(async () =>
        channel("dm1", { kind: "dm", community_id: null, name: null }),
      ),
    },
    messages: {
      listMessages: vi.fn(async (): Promise<MessageRecord[]> => []),
      getLatestMessages: vi.fn(async () => []),
      sendMessage: vi.fn(
        async (channelId: string, draft: { nonce: string; body: string }) =>
          message(50, {
            channel_id: channelId,
            author_id: "me",
            body: draft.body,
            nonce: draft.nonce,
          }),
      ),
    },
    social: {
      loadSocial: vi.fn(async () => ({
        requests: [],
        friendships: [],
        blocks: [],
        links: [],
      })),
      listMyFriendLinks: vi.fn(async () => []),
    },
    notifications: {
      listNotifications: vi.fn(async () => []),
      countUnseen: vi.fn(async () => 0),
      listPreferences: vi.fn(async () => []),
    },
    safety: {
      listMyReports: vi.fn(async () => []),
      listDecisionsAboutMe: vi.fn(async () => []),
      listCommunityReports: vi.fn(async () => [communityReport(tid(1))]),
      listCases: vi.fn(async () => []),
    },
    media: {
      signedUrls: vi.fn(
        async (files: { id: string }[]) =>
          new Map(files.map((f) => [f.id, `https://signed/${f.id}`])),
      ),
    },
    realtime: {
      subscribeToMyEvents: vi.fn((_userId: string, opts: MyEventsOptions) => {
        listening = opts;
        return stop;
      }),
    },
  };
  const stores: Partial<Record<StoreName, StatePort<object>>> = {};
  const makePort: MakePort = (name, initial) => {
    const made = createPlainStatePort(initial);
    stores[name] = made as StatePort<object>;
    return made;
  };
  const storage = options.storage ?? createMemoryPersistence();
  const core = new HavenCore({
    backend: b as unknown as Backend,
    makePort,
    storage,
    context: { platform: "web" },
    scheduleWrites: () => () => {},
  });
  const read = <S>(name: StoreName) => stores[name]!.get() as S;
  /** Every store as it is now, to compare with later. */
  const snapshot = () =>
    Object.fromEntries(
      Object.entries(stores).map(([name, port]) => [
        name,
        structuredClone(port!.get()),
      ]),
    );
  return {
    core,
    snapshot,
    b,
    stop,
    storage,
    read,
    connect: () => listening!.onConnected?.(),
    trouble: () => listening!.onTrouble?.("CHANNEL_ERROR"),
    send: (event: Parameters<HavenCore["apply"]>[0]) =>
      listening!.onEvent(event),
  };
}

/** Signed in, listening, and loaded. */
async function ready() {
  const it = setup();
  const signedIn = it.core.signIn("me");
  it.connect();
  await signedIn;
  return it;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("signing in", () => {
  it("shows what the device kept at once, and loads once the topic is listening", async () => {
    const storage = createMemoryPersistence();
    storage.set(
      deviceKey("me", "session", 1),
      JSON.stringify({
        place: {
          kind: "community",
          community_id: "hearth",
          channel_id: "general",
        },
        lastChannel: { hearth: "general" },
        drafts: {},
      }),
    );
    const { core, b, read, connect } = setup({ storage });
    const signedIn = core.signIn("me");
    expect(read<{ place: unknown }>("session").place).toEqual({
      kind: "community",
      community_id: "hearth",
      channel_id: "general",
    });
    expect(core.state.get().phase).toBe("loading");
    expect(b.communities.listMyCommunities).not.toHaveBeenCalled();

    connect();
    await signedIn;
    expect(core.state.get()).toEqual({
      phase: "ready",
      userId: "me",
      connected: true,
    });
    expect(b.communities.listMyCommunities).toHaveBeenCalledTimes(1);
    expect(b.communities.loadCommunity).toHaveBeenCalledWith("hearth");
    expect(b.channels.listCommunityChannels).toHaveBeenCalledWith("hearth");
    // The place the person was in opens.
    expect(b.messages.listMessages).toHaveBeenCalledWith(
      "general",
      expect.anything(),
    );
    // Members' profiles are fetched with the community.
    expect(b.people.getProfiles).toHaveBeenCalledWith(["ana", "me"]);
  });

  it("loads anyway when the topic is slow, and again once it listens", async () => {
    vi.useFakeTimers();
    const { core, b, connect } = setup();
    const signedIn = core.signIn("me");
    await vi.advanceTimersByTimeAsync(CONNECT_WAIT_MS);
    await signedIn;
    expect(core.state.get().phase).toBe("ready");
    expect(core.state.get().connected).toBe(false);
    connect();
    await vi.waitFor(() =>
      expect(b.communities.listMyCommunities).toHaveBeenCalledTimes(2),
    );
  });

  it("connecting in time loads once, not again when the wait runs out", async () => {
    vi.useFakeTimers();
    const { core, b, connect } = setup();
    const signedIn = core.signIn("me");
    connect();
    await signedIn;
    await vi.advanceTimersByTimeAsync(CONNECT_WAIT_MS * 2);
    expect(b.communities.listMyCommunities).toHaveBeenCalledTimes(1);
  });

  it("every reconnect loads again, open windows included", async () => {
    const { core, b, connect, trouble } = await ready();
    await core.openChannel("hearth", "general");
    trouble();
    expect(core.state.get().connected).toBe(false);
    connect();
    expect(core.state.get().connected).toBe(true);
    await vi.waitFor(() => {
      expect(b.communities.listMyCommunities).toHaveBeenCalledTimes(2);
      expect(b.people.loadMyAccount).toHaveBeenCalledTimes(2);
      expect(b.messages.listMessages).toHaveBeenCalledTimes(2);
    });
  });

  it("signing in again as the same person is the same session", async () => {
    const { core, b } = await ready();
    await core.signIn("me");
    expect(b.realtime.subscribeToMyEvents).toHaveBeenCalledTimes(1);
  });
});

describe("signing out", () => {
  it("stops listening, empties everything and removes what the device kept", async () => {
    const it = setup();
    const before = it.snapshot();
    const signedIn = it.core.signIn("me");
    it.connect();
    await signedIn;
    const { core, stop, storage, read } = it;
    await core.openChannel("hearth", "general");
    await core.attachments.ensure([
      {
        id: "file",
        bucket: "attachments",
        object_path: "m/file",
        filename: null,
        mime_type: "image/png",
        size_bytes: 1,
        width: null,
        height: null,
      },
    ]);
    expect(core.attachments.url("file")).not.toBeNull();
    await core.cases.loadQueue();
    await core.reports.loadMine();
    core.session.setDraft("general", { body: "unsent", reply_to_id: null });
    core.flush();
    expect(storage.getString(deviceKey("me", "session", 1))).not.toBeNull();
    core.signOut();
    expect(stop).toHaveBeenCalled();
    expect(core.state.get()).toEqual({
      phase: "signed_out",
      userId: null,
      connected: false,
    });
    expect(read<{ byId: object }>("communities").byId).toEqual({});
    expect(read<{ place: unknown }>("session").place).toBeNull();
    expect(storage.getString(deviceKey("me", "session", 1))).toBeNull();
    // Every store is as it was before anyone signed in. Voice keeps the
    // device's audio choices, which are not the person's.
    const after = it.snapshot();
    for (const name of Object.keys(before)) {
      if (name === "voice") continue;
      expect({ name, state: after[name] }).toEqual({
        name,
        state: before[name],
      });
    }
  });

  it("a load from the session that ended does not mark the next one ready", async () => {
    const { core, b, connect } = setup();
    const slow = deferred<ReturnType<typeof community>[]>();
    b.communities.listMyCommunities.mockReturnValueOnce(slow.promise);
    void core.signIn("me");
    connect();
    core.signOut();
    slow.resolve([community("hearth")]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(core.state.get().phase).toBe("signed_out");
  });
});

describe("events", () => {
  it("a new message reaches the window, the channel's unread count and the author's profile", async () => {
    const { core, b, send, read } = await ready();
    await core.openChannel("hearth", "general");
    send({
      event: "message.created",
      payload: message(60, { author_id: "zed" }),
    });
    expect(core.messages.window("general")?.ids).toEqual([tid(60)]);
    expect(
      read<{ unread: Record<string, number> }>("channels").unread.general,
    ).toBe(1);
    await vi.waitFor(() =>
      expect(b.people.getProfiles).toHaveBeenLastCalledWith(["zed"]),
    );
  });

  it("the person's own message from another device counts as read", async () => {
    const { send, read } = await ready();
    send({
      event: "message.created",
      payload: message(60, { author_id: "me" }),
    });
    expect(
      read<{ unread: Record<string, number> }>("channels").unread.general ?? 0,
    ).toBe(0);
  });

  it("leaving a community, on any device, leaves nothing of it behind", async () => {
    const { core, send, read } = await ready();
    const gone = vi.fn();
    core.listen({ communityGone: gone });
    await core.openChannel("hearth", "general");
    core.session.setDraft("random", { body: "x", reply_to_id: null });
    await core.reports.loadCommunity("hearth");
    send({ event: "member.left", payload: member("me") });
    expect(core.communities.get("hearth")).toBeUndefined();
    expect(core.channels.idsOf("hearth")).toEqual([]);
    expect(core.messages.window("general")).toBeUndefined();
    const session = read<{
      place: unknown;
      drafts: object;
      lastChannel: object;
    }>("session");
    expect(session.place).toBeNull();
    expect(session.drafts).toEqual({});
    expect(session.lastChannel).toEqual({});
    expect(read<{ byCommunity: object }>("reports").byCommunity).toEqual({});
    expect(core.members.get("hearth", "ana")).toBeUndefined();
    expect(gone).toHaveBeenCalledWith("hearth");
  });

  it("someone else leaving only takes their membership", async () => {
    const { core, send } = await ready();
    send({ event: "member.left", payload: member("ana") });
    expect(core.members.get("hearth", "ana")).toBeUndefined();
    expect(core.communities.get("hearth")).toBeDefined();
  });

  it("a deleted community goes the same way", async () => {
    const { core, send } = await ready();
    send({ event: "community.deleted", payload: { id: "hearth" } });
    expect(core.channels.idsOf("hearth")).toEqual([]);
  });

  it("a community gone missing from a reload goes the same way", async () => {
    const { core, b, connect, read } = await ready();
    await core.openChannel("hearth", "general");
    b.communities.listMyCommunities.mockResolvedValueOnce([]);
    connect();
    await vi.waitFor(() =>
      expect(read<{ place: unknown }>("session").place).toBeNull(),
    );
    expect(core.messages.window("general")).toBeUndefined();
  });

  it("a channel that is gone is forgotten everywhere", async () => {
    const { core, send, read } = await ready();
    await core.openChannel("hearth", "general");
    send({ event: "channel.deleted", payload: channel("general") });
    expect(core.channels.get("general")).toBeUndefined();
    expect(core.messages.window("general")).toBeUndefined();
    expect(read<{ place: unknown }>("session").place).toEqual({
      kind: "community",
      community_id: "hearth",
      channel_id: null,
    });
  });

  it("deleting a channel here forgets it everywhere too", async () => {
    const { core, b, read } = await ready();
    await core.openChannel("hearth", "general");
    await core.deleteChannel("general");
    expect(b.channels.deleteChannel).toHaveBeenCalledWith("general");
    expect(core.channels.get("general")).toBeUndefined();
    expect(core.messages.window("general")).toBeUndefined();
    expect(
      read<{ place: { channel_id: string | null } }>("session").place
        .channel_id,
    ).toBeNull();
  });

  it("access.changed loads the community again and forgets what is no longer visible", async () => {
    const { core, b, send, read } = await ready();
    await core.openChannel("hearth", "general");
    await core.reports.loadCommunity("hearth");
    b.channels.listCommunityChannels.mockResolvedValueOnce([channel("random")]);
    b.communities.getMyPermissions.mockResolvedValueOnce(["view_channels"]);
    send({ event: "access.changed", payload: { community_id: "hearth" } });
    await vi.waitFor(() =>
      expect(read<{ byCommunity: object }>("reports").byCommunity).toEqual({}),
    );
    expect(core.channels.idsOf("hearth")).toEqual(["random"]);
    expect(core.messages.window("general")).toBeUndefined();
    expect(
      read<{ place: { channel_id: string | null } }>("session").place
        .channel_id,
    ).toBeNull();
  });

  it("access.changed for a moderator who still moderates loads the reports again", async () => {
    const { core, b, send } = await ready();
    await core.reports.loadCommunity("hearth");
    send({ event: "access.changed", payload: { community_id: "hearth" } });
    await vi.waitFor(() =>
      expect(b.safety.listCommunityReports).toHaveBeenCalledTimes(2),
    );
  });

  it("a ban hides the person's messages from someone who may see hidden ones", async () => {
    const { core, b, send } = await ready();
    b.messages.listMessages.mockResolvedValueOnce([
      message(5, { author_id: "zed" }),
    ]);
    await core.openChannel("hearth", "general");
    send({
      event: "member.banned",
      payload: { community_id: "hearth", user_id: "zed" },
    });
    expect(core.messages.get(tid(5))?.hidden).toBe(true);
  });

  it("joining on another device loads the community", async () => {
    const { b, send } = await ready();
    b.communities.listMyCommunities.mockResolvedValueOnce([
      community("hearth"),
      community("club"),
    ]);
    send({
      event: "member.joined",
      payload: member("me", { community_id: "club" }),
    });
    await vi.waitFor(() =>
      expect(b.channels.listCommunityChannels).toHaveBeenCalledWith("club"),
    );
  });

  it("the account, friend links, notifications and reports load again when told", async () => {
    const { core, b, send } = await ready();
    await core.reports.loadMine();
    send({ event: "account.changed", payload: {} });
    send({ event: "friend_links.changed", payload: {} });
    send({ event: "notifications.changed", payload: {} });
    send({
      event: "notification.created",
      payload: notification(9, { kind: "report_outcome" }),
    });
    await vi.waitFor(() => {
      expect(b.people.loadMyAccount).toHaveBeenCalledTimes(2);
      expect(b.social.listMyFriendLinks).toHaveBeenCalledTimes(1);
      expect(b.notifications.listNotifications).toHaveBeenCalledTimes(2);
      expect(b.safety.listMyReports).toHaveBeenCalledTimes(2);
    });
  });

  it("an outcome does not load reports nobody opened", async () => {
    const { b, send } = await ready();
    send({
      event: "notification.created",
      payload: notification(9, { kind: "report_outcome" }),
    });
    expect(b.safety.listMyReports).not.toHaveBeenCalled();
  });

  it("hands the platform what is not a record", async () => {
    const { core, send } = await ready();
    const heard = { restricted: vi.fn(), notification: vi.fn() };
    core.listen(heard);
    send({ event: "account.restricted", payload: { ends_at: null } });
    send({ event: "notification.created", payload: notification(9) });
    expect(heard.restricted).toHaveBeenCalledWith({ ends_at: null });
    expect(heard.notification).toHaveBeenCalledWith(notification(9));
  });

  it("a voice control reaches the call it names, and sign-out ends the call", async () => {
    const { core, send, read } = await ready();
    const onKick = vi.fn();
    await core.voice.connectKickChannel({
      sessionId: "s1",
      communityId: "hearth",
      channelId: "lounge",
      currentUserId: "me",
      onKick,
    });
    core.voice.setJoined(true);
    const control = {
      channel_id: "lounge",
      community_id: "hearth",
      channel_name: "Lounge",
      target_user_id: "me",
      target_session_id: "s1",
      actor_id: "owner",
      actor_name: "owner",
      action: "mute" as const,
    };
    send({
      event: "voice.control",
      payload: { ...control, target_session_id: "s0" },
    });
    expect(read<VoiceState>("voice").isMuted).toBe(false);
    send({ event: "voice.control", payload: control });
    expect(read<VoiceState>("voice").isMuted).toBe(true);
    send({ event: "voice.control", payload: { ...control, action: "remove" } });
    expect(onKick).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "lounge", kickedBy: "owner" }),
    );
    core.signOut();
    expect(read<VoiceState>("voice")).toMatchObject({
      joined: false,
      isMuted: false,
      controlNotice: null,
    });
  });

  it("one event that fails does not stop the next", async () => {
    const { core, send } = await ready();
    vi.spyOn(console, "error").mockImplementation(() => {});
    send({ event: "message.created", payload: null as never });
    vi.restoreAllMocks();
    send({
      event: "community.updated",
      payload: community("hearth", { name: "Renamed" }),
    });
    expect(core.communities.get("hearth")?.name).toBe("Renamed");
  });
});

describe("commands across collections", () => {
  it("sending empties the box and sends the words", async () => {
    const { core, b, read } = await ready();
    core.session.setDraft("general", { body: "hello", reply_to_id: null });
    await core.send("general", { body: "hello" });
    expect(read<{ drafts: object }>("session").drafts).toEqual({});
    expect(b.messages.sendMessage).toHaveBeenCalledWith(
      "general",
      expect.objectContaining({ body: "hello" }),
    );
  });

  it("a profile change shows in everyone's view of the person", async () => {
    const { core } = await ready();
    await core.updateProfile({ username: "renamed" });
    expect(core.profiles.get("me")?.username).toBe("renamed");
  });

  it("an introduction that joins a community leaves the person in it; skipping does not", async () => {
    const { core, b } = await ready();
    await core.answerOnboarding("join", "skipped");
    expect(b.channels.listCommunityChannels).not.toHaveBeenCalledWith("club");
    await core.answerOnboarding("join", "completed");
    expect(b.communities.loadCommunity).toHaveBeenCalledWith("club");
    expect(b.channels.listCommunityChannels).toHaveBeenCalledWith("club");
  });

  it("joining by invite loads the community and opens it", async () => {
    const { core, b, read } = await ready();
    expect(await core.joinCommunity("CODE")).toBe("joined");
    expect(b.channels.listCommunityChannels).toHaveBeenCalledWith("joined");
    expect(
      read<{ place: { community_id: string } }>("session").place.community_id,
    ).toBe("joined");
  });

  it("creating a community loads its channels and opens it", async () => {
    const { core, b, read } = await ready();
    expect(await core.createCommunity("Book club")).toBe("made");
    expect(b.channels.listCommunityChannels).toHaveBeenCalledWith("made");
    expect(
      read<{ place: { community_id: string } }>("session").place.community_id,
    ).toBe("made");
  });

  it("opening a conversation with someone holds it and opens it", async () => {
    const { core, b, read } = await ready();
    // The database lists the conversation it just made, with both people.
    b.channels.listConversations.mockResolvedValue({
      channels: [
        channel("dm1", { kind: "dm", community_id: null, name: null }),
      ],
      participants: [
        { channel_id: "dm1", user_id: "me" },
        { channel_id: "dm1", user_id: "ana" },
      ],
    } as never);
    expect(await core.openConversationWith("ana")).toBe("dm1");
    expect(b.channels.openConversation).toHaveBeenCalledWith("ana");
    expect(core.channels.get("dm1")?.kind).toBe("dm");
    expect(read<{ place: unknown }>("session").place).toEqual({
      kind: "conversation",
      channel_id: "dm1",
    });
  });

  it("opening a community opens the channel last open there", async () => {
    const { core, b } = await ready();
    await core.openChannel("hearth", "random");
    core.session.goHome();
    b.messages.listMessages.mockClear();
    core.messages.dropChannel("random");
    await core.openCommunity("hearth");
    expect(b.messages.listMessages).toHaveBeenCalledWith(
      "random",
      expect.anything(),
    );
  });
});
