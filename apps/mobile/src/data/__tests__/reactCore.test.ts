/**
 * Mobile's HavenCore: the collections write Zustand stores the screens read.
 *
 * - The stores are the core's: a collection's write lands in the store a
 *   screen subscribes to, and tells it.
 * - `cachedSnapshot` (under `useCore`) hands React the same value back while
 *   nothing it reads changed, however the selector builds it; otherwise
 *   `useSyncExternalStore` renders forever. Across stores it follows each.
 * - What to call someone follows nicknames and profiles; signing out empties
 *   every store.
 */
import { describe, expect, it, vi } from "vitest";
import { shallow } from "zustand/shallow";
import type { Backend } from "@shared/lib/backend";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import { membersOf } from "@shared/collections/members/selectors";
import type { StoreStates } from "@shared/collections/core/havenCore";
import { HavenReactCore } from "../core/HavenReactCore";
import { cachedSnapshot, subscribeStores } from "../core/coreSnapshot";

const at = "2026-11-15T00:00:00.000Z";

function makeCore() {
  return new HavenReactCore({
    client: {} as never,
    persistence: createMemoryPersistence(),
    context: { platform: "ios", distribution: "all" },
    // Nothing here calls the backend; the collections are written directly.
    backend: { realtime: {} } as unknown as Backend,
  });
}

const profile = (id: string, username: string | null = id) => ({
  id,
  username,
  avatar_media_id: null,
  is_staff: false,
  deleted: false,
});

const member = (userId: string, nickname: string | null = null) => ({
  community_id: "hearth",
  user_id: userId,
  nickname,
  joined_at: at,
});

describe("mobile's HavenCore", () => {
  it("writes every collection into the store a screen reads, and tells it", () => {
    const core = makeCore();
    const heard = vi.fn();
    const stop = core.stores.profiles.subscribe(heard);
    core.profiles.applyProfile(profile("ana"));
    expect(core.stores.profiles.getState().byId.ana?.username).toBe("ana");
    expect(heard).toHaveBeenCalled();
    stop();
  });

  it("hands back the same value while nothing it reads changed", () => {
    const core = makeCore();
    core.members.applyMember(member("ana"));
    // A selector that builds a new array on every call, as screens' do.
    const snapshot = cachedSnapshot<"members", string[]>(
      core.stores,
      ["members"],
      () => ({
        select: (s) => membersOf(s.members, "hearth").map((m) => m.user_id),
        equal: shallow,
      }),
    );
    const first = snapshot();
    expect(snapshot()).toBe(first);
    // A write to another store, or one that changes nothing read, keeps it.
    core.profiles.applyProfile(profile("ana"));
    expect(snapshot()).toBe(first);

    core.members.applyMember(member("ben"));
    const second = snapshot();
    expect(second).not.toBe(first);
    expect(second).toEqual(["ana", "ben"]);
  });

  it("hands back the same value for a selector shallow equality can't settle", () => {
    const core = makeCore();
    core.members.applyMember(member("ana"));
    // Rows built fresh each call, as the channel drawer's groups are: two
    // calls are never shallow-equal, and React loops on "getSnapshot should
    // be cached" unless nothing re-runs while nothing changed.
    const select = (s: Pick<StoreStates, "members">) =>
      membersOf(s.members, "hearth").map((m) => ({ id: m.user_id }));
    const snapshot = cachedSnapshot<"members", { id: string }[]>(
      core.stores,
      ["members"],
      () => ({ select, equal: shallow }),
    );
    const first = snapshot();
    expect(snapshot()).toBe(first);
    core.profiles.applyProfile(profile("ana"));
    expect(snapshot()).toBe(first);

    core.members.applyMember(member("ben"));
    expect(snapshot()).not.toBe(first);
    expect(snapshot()).toEqual([{ id: "ana" }, { id: "ben" }]);
  });

  it("follows each store it reads, and tells the screen when any changes", () => {
    const core = makeCore();
    core.members.applyMember(member("ana"));
    core.profiles.applyProfile(profile("ana", "ana_b"));
    const heard = vi.fn();
    const stop = subscribeStores(core.stores, ["members", "profiles"], heard);
    const name = cachedSnapshot(core.stores, ["members", "profiles"], () => ({
      select: () => core.nameOf("ana", "hearth"),
      equal: Object.is,
    }));
    expect(name()).toBe("ana_b");

    core.profiles.applyProfile(profile("ana", "ana_c"));
    expect(name()).toBe("ana_c");
    core.members.applyMember(member("ana", "Ana"));
    expect(name()).toBe("Ana");
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    core.profiles.applyProfile(profile("ana", "ana_d"));
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("calls a deleted account a deleted user, and an unknown one a stand-in", () => {
    const core = makeCore();
    core.profiles.applyProfile({ ...profile("gone"), deleted: true });
    expect(core.nameOf("gone")).toBe("Deleted user");
    expect(core.nameOf("nobody")).toBe("…");
  });

  it("empties every store on sign-out", () => {
    const core = makeCore();
    const fresh = Object.fromEntries(
      Object.entries(core.stores).map(([name, store]) => [
        name,
        JSON.stringify(store.getState()),
      ]),
    );
    core.profiles.applyProfile(profile("ana"));
    core.members.applyMember(member("ana"));
    core.session.setDraft("general", { body: "hi", reply_to_id: null });
    core.signOut();
    for (const [name, store] of Object.entries(core.stores)) {
      // Voice keeps the device's audio choices; its call is checked below.
      if (name === "voice") continue;
      expect({ name, state: JSON.stringify(store.getState()) }).toEqual({
        name,
        state: fresh[name],
      });
    }
    const voice = core.stores.voice.getState();
    expect(voice.activeChannel).toBeNull();
    expect(voice.participants).toEqual([]);
    expect(voice.joined).toBe(false);
  });
});
