import { describe, expect, it, vi } from "vitest";
import {
  Categories,
  categoriesCopy,
  createCategoriesState,
} from "../categories/categories";
import { categoriesOf, isCollapsed } from "../categories/selectors";
import {
  Communities,
  type CommunitiesBackendPart,
  communitiesCopy,
  createCommunitiesState,
} from "../communities/communities";
import { invitesOf, myCommunities } from "../communities/selectors";
import type { Invite } from "@shared/lib/backend/records";
import { createPlainStatePort } from "../kit/statePort";
import { createMembersState, Members } from "../members/members";
import { membersOf } from "../members/selectors";
import { createRolesState, Roles } from "../roles/roles";
import { rolesOf, rolesOfMember } from "../roles/selectors";
import {
  category,
  community,
  deferred,
  member,
  role,
  structure,
} from "./fixtures";

function setup(backend: Partial<CommunitiesBackendPart> = {}) {
  const port = createPlainStatePort(createCommunitiesState());
  const membersPort = createPlainStatePort(createMembersState());
  const rolesPort = createPlainStatePort(createRolesState());
  const categoriesPort = createPlainStatePort(createCategoriesState());
  const members = new Members(membersPort, {} as never);
  const roles = new Roles(rolesPort, {} as never);
  const categories = new Categories(categoriesPort, {} as never);
  const calls = {
    listMyCommunities: vi.fn(backend.listMyCommunities ?? (async () => [])),
    loadCommunity: vi.fn(
      backend.loadCommunity ?? (async (id: string) => structure(id)),
    ),
    getMyPermissions: vi.fn(backend.getMyPermissions ?? (async () => [])),
    createCommunity: vi.fn(
      backend.createCommunity ?? (async (name: string) => community(name)),
    ),
    updateCommunity: vi.fn(
      backend.updateCommunity ?? (async (id: string) => community(id)),
    ),
    deleteCommunity: vi.fn(backend.deleteCommunity ?? (async () => {})),
    transferOwnership: vi.fn(
      backend.transferOwnership ?? (async (id: string) => community(id)),
    ),
    joinCommunity: vi.fn(
      backend.joinCommunity ?? (async () => community("hearth")),
    ),
    leaveCommunity: vi.fn(backend.leaveCommunity ?? (async () => {})),
    listInvites: vi.fn(backend.listInvites ?? (async () => [])),
    createInvite: vi.fn(backend.createInvite ?? (async () => invite("new"))),
    revokeInvite: vi.fn(backend.revokeInvite ?? (async () => {})),
  };
  const communities = new Communities(port, calls, [
    members,
    roles,
    categories,
  ]);
  return {
    port,
    calls,
    communities,
    members: membersPort,
    roles: rolesPort,
    categories: categoriesPort,
  };
}

const invite = (id: string, created_at = "2026-11-14T12:00:00Z"): Invite => ({
  id,
  community_id: "hearth",
  code: id,
  created_by: "owner",
  max_uses: null,
  uses: 0,
  expires_at: null,
  created_at,
});

/** A hearth with two members, a role held by ana, and a collapsed category. */
const hearth = () =>
  structure("hearth", {
    members: [member("ana"), member("ben")],
    roles: [
      role("mods", { position: 2 }),
      role("everyone", { position: 0, is_everyone: true }),
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
        role_id: "mods",
        assigned_at: "",
      },
    ],
    categories: [category("talk"), category("games", { position: 1 })],
    collapsed_category_ids: ["games"],
  });

describe("loading a community", () => {
  it("hands its members, roles and categories to their collections", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    ctx.calls.getMyPermissions.mockResolvedValue(["send_messages"]);
    await ctx.communities.loadCommunity("hearth");

    expect(ctx.communities.get("hearth")?.name).toBe("hearth");
    expect(ctx.communities.can("hearth", "send_messages")).toBe(true);
    expect(ctx.communities.can("hearth", "manage_messages")).toBe(false);
    expect(
      membersOf(ctx.members.get(), "hearth").map((m) => m.user_id),
    ).toEqual(["ana", "ben"]);
    expect(rolesOf(ctx.roles.get(), "hearth").map((r) => r.id)).toEqual([
      "mods",
      "everyone",
    ]);
    expect(ctx.roles.get().permissions.mods).toEqual(["manage_messages"]);
    expect(ctx.roles.get().permissions.everyone).toEqual([]);
    expect(
      rolesOfMember(ctx.roles.get(), "hearth", "ana").map((r) => r.id),
    ).toEqual(["mods"]);
    expect(
      categoriesOf(ctx.categories.get(), "hearth").map((c) => c.id),
    ).toEqual(["talk", "games"]);
    expect(isCollapsed(ctx.categories.get(), "games")).toBe(true);
  });

  it("replaces what it held for the community, and leaves other communities alone", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    await ctx.communities.loadCommunity("hearth");
    ctx.calls.loadCommunity.mockImplementation(async (id: string) =>
      structure(id, {
        members: [member("cy", { community_id: id })],
        roles: [role("other-role", { community_id: id })],
        categories: [category("other-cat", { community_id: id })],
      }),
    );
    await ctx.communities.loadCommunity("other");

    // The access change took ana's role and ben's membership away.
    ctx.calls.loadCommunity.mockResolvedValue(
      structure("hearth", {
        members: [member("ana")],
        roles: [role("mods", { position: 2 })],
        categories: [category("talk")],
      }),
    );
    await ctx.communities.loadCommunity("hearth");

    expect(
      membersOf(ctx.members.get(), "hearth").map((m) => m.user_id),
    ).toEqual(["ana"]);
    expect(rolesOfMember(ctx.roles.get(), "hearth", "ana")).toEqual([]);
    expect(ctx.roles.get().permissions.mods).toEqual([]);
    expect(isCollapsed(ctx.categories.get(), "games")).toBe(false);
    expect(
      categoriesOf(ctx.categories.get(), "hearth").map((c) => c.id),
    ).toEqual(["talk"]);
    expect(membersOf(ctx.members.get(), "other")).toHaveLength(1);
    expect(rolesOf(ctx.roles.get(), "other")).toHaveLength(1);
    expect(categoriesOf(ctx.categories.get(), "other")).toHaveLength(1);
  });

  it("drops communities the person is no longer in when the list loads again", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    await ctx.communities.loadCommunity("hearth");
    ctx.calls.listMyCommunities.mockResolvedValue([community("other")]);
    await ctx.communities.loadMine();

    expect(myCommunities(ctx.port.get()).map((c) => c.id)).toEqual(["other"]);
    expect(membersOf(ctx.members.get(), "hearth")).toEqual([]);
    expect(ctx.port.get().permissions.hearth).toBeUndefined();
  });

  it("writes nothing from a load that ends after the community is gone", async () => {
    const answer = deferred<ReturnType<typeof hearth>>();
    const ctx = setup();
    ctx.calls.loadCommunity.mockReturnValue(answer.promise);
    const loading = ctx.communities.loadCommunity("hearth");
    ctx.communities.applyGone("hearth");
    answer.resolve(hearth());
    await loading;
    expect(ctx.port.get().byId).toEqual({});
    expect(ctx.members.get().byKey).toEqual({});
  });
});

describe("a community that is gone", () => {
  it("leaves nothing of itself behind in any part", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    ctx.calls.getMyPermissions.mockResolvedValue(["manage_invites"]);
    await ctx.communities.loadCommunity("hearth");
    ctx.calls.listInvites.mockResolvedValue([invite("abc")]);
    await ctx.communities.loadInvites("hearth");

    ctx.communities.applyGone("hearth");
    // Each field by itself: toMatchObject({ byId: {} }) would match any byId.
    const { byId, permissions, invites } = ctx.port.get();
    expect({ byId, permissions, invites }).toEqual({
      byId: {},
      permissions: {},
      invites: {},
    });
    expect(ctx.members.get().byKey).toEqual({});
    const roles = ctx.roles.get();
    expect({
      byId: roles.byId,
      permissions: roles.permissions,
      held: roles.held,
    }).toEqual({ byId: {}, permissions: {}, held: {} });
    const categories = ctx.categories.get();
    expect({
      byId: categories.byId,
      collapsed: categories.collapsed,
    }).toEqual({ byId: {}, collapsed: {} });
  });

  it("is gone once the person leaves", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    await ctx.communities.loadCommunity("hearth");
    await ctx.communities.leave("hearth");
    expect(ctx.calls.leaveCommunity).toHaveBeenCalledWith("hearth");
    expect(ctx.communities.get("hearth")).toBeUndefined();
  });

  it("stays when the database refuses to delete it", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    await ctx.communities.loadCommunity("hearth");
    ctx.calls.deleteCommunity.mockRejectedValue(new Error("not the owner"));
    await expect(ctx.communities.remove("hearth")).rejects.toThrow();
    expect(ctx.communities.get("hearth")).toBeDefined();
  });
});

describe("commands", () => {
  it("joins with a code and loads what it joined", async () => {
    const ctx = setup({ loadCommunity: async () => hearth() });
    await ctx.communities.join("abc");
    expect(ctx.calls.loadCommunity).toHaveBeenCalledWith("hearth");
    expect(membersOf(ctx.members.get(), "hearth")).toHaveLength(2);
  });

  it("shows the database's answer to a change", async () => {
    const ctx = setup();
    ctx.calls.updateCommunity.mockResolvedValue(
      community("hearth", { name: "The Hearth" }),
    );
    await ctx.communities.update("hearth", { name: "The Hearth" });
    expect(ctx.communities.get("hearth")?.name).toBe("The Hearth");
  });

  it("adds a new invite to a list that is held, newest first", async () => {
    const ctx = setup();
    ctx.calls.listInvites.mockResolvedValue([
      invite("old", "2026-11-01T00:00:00Z"),
    ]);
    await ctx.communities.loadInvites("hearth");
    await ctx.communities.createInvite("hearth");
    expect(invitesOf(ctx.port.get(), "hearth").map((i) => i.id)).toEqual([
      "new",
      "old",
    ]);
    await ctx.communities.revokeInvite("hearth", "old");
    expect(invitesOf(ctx.port.get(), "hearth").map((i) => i.id)).toEqual([
      "new",
    ]);
  });
});

describe("views", () => {
  it("lists communities by name, whatever the case", () => {
    const ctx = setup();
    ctx.communities.applyCommunity(community("b", { name: "beta" }));
    ctx.communities.applyCommunity(community("a", { name: "Alpha" }));
    ctx.communities.applyCommunity(community("c", { name: "Zed" }));
    // By code unit, "Zed" would come before "beta".
    expect(myCommunities(ctx.port.get()).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("the device copies", () => {
  it("keep the community list, never permissions", () => {
    const state = createCommunitiesState();
    state.byId = { hearth: community("hearth") };
    state.permissions = { hearth: ["manage_community"] };
    const saved = JSON.parse(JSON.stringify(communitiesCopy.pick(state)));
    expect(communitiesCopy.restore(saved)).toEqual({
      byId: { hearth: community("hearth") },
    });
  });

  it("keep categories and which are collapsed", () => {
    const state = createCategoriesState();
    state.byId = { talk: category("talk") };
    state.collapsed = { talk: true };
    const saved = JSON.parse(JSON.stringify(categoriesCopy.pick(state)));
    expect(categoriesCopy.restore(saved)).toEqual({
      byId: { talk: category("talk") },
      collapsed: { talk: true },
    });
  });
});
