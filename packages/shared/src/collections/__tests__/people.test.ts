// Members, roles, categories and profiles: the collections that hold the
// people and arrangement of a community.
import { describe, expect, it, vi } from "vitest";
import { Categories, createCategoriesState } from "../categories/categories";
import { isCollapsed } from "../categories/selectors";
import { createPlainStatePort } from "../kit/statePort";
import { createMembersState, Members } from "../members/members";
import { bansOf, displayName, membersOf } from "../members/selectors";
import { createProfilesState, Profiles } from "../profiles/profiles";
import { createRolesState, Roles } from "../roles/roles";
import { memberColor, rolesOf, rolesOfMember } from "../roles/selectors";
import {
  category,
  deferred,
  member,
  profile,
  role,
  structure,
} from "./fixtures";

const ban = (userId: string, created_at = "2026-11-14T12:00:00Z") => ({
  community_id: "hearth",
  user_id: userId,
  banned_by: "owner",
  reason: "spam",
  created_at,
});

function members() {
  const port = createPlainStatePort(createMembersState());
  const calls = {
    kickMember: vi.fn(async () => {}),
    banMember: vi.fn(async () => {}),
    unbanMember: vi.fn(async () => {}),
    listBans: vi.fn(async () => [ban("cy")]),
    setNickname: vi.fn(async () => member("ana", { nickname: "Annie" })),
  };
  const collection = new Members(port, calls);
  collection.takeStructure(
    structure("hearth", { members: [member("ana"), member("ben")] }),
  );
  return { port, calls, members: collection };
}

describe("members", () => {
  it("follows joins, changes and departures", () => {
    const { port, members: m } = members();
    // "al" sorts before "ana" by id, but joined later.
    m.applyMember(member("al", { joined_at: "2026-11-15T00:00:00Z" }));
    m.applyMember(member("ana", { nickname: "Annie" }));
    m.applyLeft(member("ben"));
    expect(membersOf(port.get(), "hearth").map((x) => x.user_id)).toEqual([
      "ana",
      "al",
    ]);
    expect(m.get("hearth", "ana")?.nickname).toBe("Annie");
  });

  it("removes a banned member at once, and reloads a ban list that is held", async () => {
    const { port, calls, members: m } = members();
    await m.loadBans("hearth");
    calls.listBans.mockResolvedValue([
      ban("cy"),
      ban("ben", "2026-11-15T00:00:00Z"),
    ]);
    await m.ban("hearth", "ben", "spam");
    expect(m.get("hearth", "ben")).toBeUndefined();
    expect(bansOf(port.get(), "hearth").map((b) => b.user_id)).toEqual([
      "ben",
      "cy",
    ]);
  });

  it("does not load bans for someone who never opened the list", async () => {
    const { calls, members: m } = members();
    m.applyBanned("hearth");
    await m.ban("hearth", "ben", "spam");
    expect(calls.listBans).not.toHaveBeenCalled();
  });

  it("reloads a held ban list when a ban arrives from someone else", async () => {
    const { calls, members: m } = members();
    await m.loadBans("hearth");
    calls.listBans.mockClear();
    m.applyBanned("hearth");
    await vi.waitFor(() => expect(calls.listBans).toHaveBeenCalledOnce());
  });

  it("drops an unbanned person from the list", async () => {
    const { port, members: m } = members();
    await m.loadBans("hearth");
    await m.unban("hearth", "cy");
    expect(bansOf(port.get(), "hearth")).toEqual([]);
  });

  it("shows a nickname from the database's answer", async () => {
    const { members: m } = members();
    await m.setNickname("hearth", "ana", "Annie");
    expect(m.get("hearth", "ana")?.nickname).toBe("Annie");
  });

  it("calls someone by their nickname, else their username", () => {
    const { port, members: m } = members();
    m.applyMember(member("ana", { nickname: "Annie" }));
    const people = createProfilesState();
    people.byId = { ana: profile("ana"), ben: profile("ben") };
    expect(displayName(port.get(), people, "hearth", "ana")).toBe("Annie");
    expect(displayName(port.get(), people, "hearth", "ben")).toBe("ben");
    expect(displayName(port.get(), people, "hearth", "nobody")).toBeNull();
  });
});

function roles() {
  const port = createPlainStatePort(createRolesState());
  const calls = {
    createRole: vi.fn(async () => role("new")),
    updateRole: vi.fn(async () => role("mods", { name: "Moderators" })),
    deleteRole: vi.fn(async () => {}),
    setRolePermissions: vi.fn(async () => {}),
    setMemberRoles: vi.fn(async () => {}),
  };
  const collection = new Roles(port, calls);
  collection.takeStructure(
    structure("hearth", {
      roles: [
        role("mods", { position: 2, color: "#ff0000" }),
        role("helpers", { position: 1, color: "#00ff00" }),
        role("everyone", { position: 0, is_everyone: true, color: "#000000" }),
      ],
      role_permissions: [
        {
          community_id: "hearth",
          role_id: "mods",
          permission: "manage_messages",
        },
      ],
      member_roles: [
        {
          community_id: "hearth",
          user_id: "ana",
          role_id: "helpers",
          assigned_at: "",
        },
        {
          community_id: "hearth",
          user_id: "ana",
          role_id: "mods",
          assigned_at: "",
        },
        {
          community_id: "hearth",
          user_id: "ben",
          role_id: "everyone",
          assigned_at: "",
        },
      ],
    }),
  );
  return { port, calls, roles: collection };
}

describe("roles", () => {
  it("colours a name by the highest role held, never the everyone role", () => {
    const { port } = roles();
    expect(memberColor(port.get(), "hearth", "ana")).toBe("#ff0000");
    expect(memberColor(port.get(), "hearth", "ben")).toBeNull();
  });

  it("takes a deleted role away from everyone who held it", () => {
    const { port, roles: r } = roles();
    r.applyRoleDeleted("mods");
    expect(rolesOf(port.get(), "hearth").map((x) => x.id)).toEqual([
      "helpers",
      "everyone",
    ]);
    expect(rolesOfMember(port.get(), "hearth", "ana").map((x) => x.id)).toEqual(
      ["helpers"],
    );
    expect(port.get().permissions.mods).toBeUndefined();
    // Not just hidden by the view: the id is gone from what ana holds.
    expect(port.get().held["hearth:ana"]).toEqual(["helpers"]);
  });

  it("gives a new role no permissions, and keeps an updated role's", async () => {
    const { port, roles: r } = roles();
    await r.create("hearth", "new");
    expect(port.get().permissions.new).toEqual([]);
    await r.update("mods", { name: "Moderators" });
    expect(r.get("mods")?.name).toBe("Moderators");
    expect(port.get().permissions.mods).toEqual(["manage_messages"]);
  });

  it("leaves permissions to the database's answer", async () => {
    const { port, calls, roles: r } = roles();
    await r.setPermissions("mods", ["manage_messages", "manage_bans"]);
    expect(calls.setRolePermissions).toHaveBeenCalled();
    // access.changed brings the new list with the next load.
    expect(port.get().permissions.mods).toEqual(["manage_messages"]);
  });

  it("forgets the roles of a member who left", () => {
    const { port, roles: r } = roles();
    r.applyLeft("hearth", "ana");
    expect(rolesOfMember(port.get(), "hearth", "ana")).toEqual([]);
  });
});

describe("categories", () => {
  function categories(refuse = false) {
    const port = createPlainStatePort(createCategoriesState());
    const calls = {
      saveCategory: vi.fn(async () => category("new")),
      deleteCategory: vi.fn(async () => {}),
      setCategoryCollapsed: vi.fn(async () => {
        if (refuse) throw new Error("offline");
      }),
    };
    const collection = new Categories(port, calls);
    collection.takeStructure(
      structure("hearth", {
        categories: [category("talk")],
        collapsed_category_ids: ["talk"],
      }),
    );
    return { port, calls, categories: collection };
  }

  it("collapses at once", async () => {
    const { port, calls, categories: c } = categories();
    const done = c.setCollapsed("talk", false);
    expect(isCollapsed(port.get(), "talk")).toBe(false);
    await done;
    expect(calls.setCategoryCollapsed).toHaveBeenCalledWith("talk", false);
  });

  it("puts it back when the database refuses", async () => {
    const { port, categories: c } = categories(true);
    await expect(c.setCollapsed("talk", false)).rejects.toThrow();
    expect(isCollapsed(port.get(), "talk")).toBe(true);
  });

  it("forgets a deleted category and that it was collapsed", () => {
    const { port, categories: c } = categories();
    c.applyCategoryDeleted("talk");
    expect(port.get().byId).toEqual({});
    expect(port.get().collapsed).toEqual({});
  });
});

describe("profiles", () => {
  function profiles() {
    const port = createPlainStatePort(createProfilesState());
    const calls = {
      getProfiles: vi.fn(async (ids: string[]) =>
        ids.filter((id) => id !== "ghost").map((id) => profile(id)),
      ),
      getProfileCard: vi.fn(async (id: string) => ({
        ...profile(id),
        details_visible: true,
        bio: "hello",
        flair: null,
        mutual_community_names: ["hearth"],
        is_friend: false,
        can_message: false,
        can_friend_request: true,
      })),
    };
    return { port, calls, profiles: new Profiles(port, calls) };
  }

  it("fetches only the people it does not hold, once each", async () => {
    const { calls, profiles: p } = profiles();
    await p.ensure(["ana", "ben", "ana"]);
    await p.ensure(["ana", "cy"]);
    expect(calls.getProfiles.mock.calls).toEqual([[["ana", "ben"]], [["cy"]]]);
  });

  it("does not fetch someone who arrived another way", async () => {
    const { calls, profiles: p } = profiles();
    p.applyProfile(profile("dee"));
    await p.ensure(["dee"]);
    expect(calls.getProfiles).not.toHaveBeenCalled();
  });

  it("does not ask again for someone being fetched, or someone who does not exist", async () => {
    const { calls, profiles: p } = profiles();
    const answer = deferred<ReturnType<typeof profile>[]>();
    calls.getProfiles.mockReturnValueOnce(answer.promise);
    const first = p.ensure(["ana"]);
    await p.ensure(["ana"]);
    answer.resolve([profile("ana")]);
    await first;
    await p.ensure(["ghost"]);
    await p.ensure(["ghost"]);
    expect(calls.getProfiles).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failed fetch", async () => {
    const { calls, profiles: p } = profiles();
    calls.getProfiles.mockRejectedValueOnce(new Error("offline"));
    await p.ensure(["ana"]);
    await p.ensure(["ana"]);
    expect(calls.getProfiles).toHaveBeenCalledTimes(2);
    expect(p.get("ana")).toBeDefined();
  });

  it("keeps an open card current with profile changes", async () => {
    const { port, profiles: p } = profiles();
    await p.loadCard("ana");
    expect(p.get("ana")).toEqual(profile("ana"));
    p.applyProfile(profile("ana", { username: "annie" }));
    expect(port.get().cards.ana).toMatchObject({
      username: "annie",
      bio: "hello",
    });
    p.closeCard("ana");
    expect(port.get().cards.ana).toBeUndefined();
  });
});
