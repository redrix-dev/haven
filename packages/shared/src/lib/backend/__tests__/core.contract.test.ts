// HavenCore against the real local database: what the apps run, end to end.
// The fakes in collections/__tests__ prove each rule; this proves the rules
// hold against the database's real answers and real realtime events.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  actor,
  eventually,
  hearthChannelId,
  hearthId,
  signOutAll,
} from "@test-support/setup/supabaseLocal";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import {
  HavenCore,
  type MakePort,
  type StoreName,
  type StoreStates,
} from "@shared/collections/core/havenCore";
import {
  createPlainStatePort,
  type StatePort,
} from "@shared/collections/kit/statePort";
import { communityChannels } from "@shared/collections/channels/selectors";
import { windowMessages } from "@shared/collections/messages/selectors";

/** One core per person, as each app has: two on one client would share its socket. */
const made = new Map<string, Awaited<ReturnType<typeof makeCore>>>();
async function signedInCore(key: "member_a" | "member_b") {
  const known = made.get(key);
  if (known) return known;
  const fresh = await makeCore(key);
  made.set(key, fresh);
  return fresh;
}

async function makeCore(key: "member_a" | "member_b") {
  const who = await actor(key);
  const stores: Partial<Record<StoreName, StatePort<object>>> = {};
  const makePort: MakePort = (name, initial) => {
    const port = createPlainStatePort(initial);
    stores[name] = port as StatePort<object>;
    return port;
  };
  const core = new HavenCore({
    backend: who.backend,
    makePort,
    storage: createMemoryPersistence(),
    context: { platform: "web" },
  });
  await core.signIn(who.id);
  const read = <N extends StoreName>(name: N) =>
    stores[name]!.get() as StoreStates[N];
  return { who, core, read };
}

describe.sequential("HavenCore (contract)", { timeout: 30_000 }, () => {
  afterAll(async () => {
    for (const { core } of made.values()) core.signOut();
    await signOutAll();
  });

  it("signs in, loads the person's world, and listens", async () => {
    const a = await signedInCore("member_a");
    expect(a.read("core")).toMatchObject({ phase: "ready", userId: a.who.id });
    await eventually(() => a.read("core").connected);
    expect(a.read("communities").byId[hearthId()]).toBeDefined();
    expect(
      communityChannels(a.read("channels"), hearthId()).map((c) => c.id),
    ).toContain(hearthChannelId("general"));
    expect(a.read("account").settings?.user_id).toBe(a.who.id);
    // Members came with the community, and their profiles with them.
    await eventually(() => a.read("profiles").byId[a.who.id]);
  });

  it("a message sent by one person reaches another's open window", async () => {
    const a = await signedInCore("member_a");
    const b = await signedInCore("member_b");
    await eventually(
      () => a.read("core").connected && b.read("core").connected,
    );
    const general = hearthChannelId("general");
    await b.core.openChannel(hearthId(), general);

    const body = `hello ${randomUUID()}`;
    const sent = await a.core.send(general, { body });
    expect(sent.body).toBe(body);

    const arrived = await eventually(() =>
      windowMessages(b.read("messages"), general).find((m) => m.id === sent.id),
    );
    expect(arrived.author_id).toBe(a.who.id);
    // Someone else's message counts as unread for b, and their profile is held.
    expect(b.read("channels").unread[general]).toBeGreaterThan(0);
    await eventually(() => b.read("profiles").byId[a.who.id]);
  });

  it("signing out empties everything", async () => {
    const a = await signedInCore("member_a");
    a.core.signOut();
    expect(a.read("core").phase).toBe("signed_out");
    expect(a.read("communities").byId).toEqual({});
    expect(a.read("messages").byId).toEqual({});
  });
});
