import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMemoryPersistence, type HavenBackends } from "@shared/core";
import {
  registerSessionBackends,
  requireSessionBackends,
  resetSessionBackends,
} from "@shared/lib/backend";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import { registerHavenCore, resetHavenCore } from "@mobile-data";
import type { HavenReactCore } from "@mobile-data/core/HavenReactCore";
import { ChannelNexus } from "@mobile-data/channels/ChannelNexus";
import { CommunityAdminNexus } from "@mobile-data/community-management/CommunityAdminNexus";
import { CommunityNexus } from "@mobile-data/communities/CommunityNexus";
import type { Channel, ServerRoleItem } from "@shared/lib/backend/types";
import { useAuthStore, useUiStore } from "@mobile-data/session";

const textChannel = (overrides: Partial<Channel> = {}): Channel =>
  ({
    id: "ch1",
    community_id: "c1",
    name: "general",
    kind: "text",
    position: 0,
    topic: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Channel;

const registerTestCore = (
  partial: Partial<HavenReactCore> & { backends?: Partial<HavenBackends> },
): void => {
  const backends = partial.backends ?? ({} as Partial<HavenBackends>);
  registerSessionBackends({
    communityData: backends.communityData,
  } as HavenBackends);
  registerHavenCore({ ...partial, backends } as HavenReactCore);
};

describe("CommunityAdminNexus", () => {
  let admin: CommunityAdminNexus;
  let channels: ChannelNexus;
  let communities: CommunityNexus;

  // CommunityAdminNexus now holds an injected communityData ref. Feed it a live
  // view of the session-registered mock so each test can still swap backends
  // through registerTestCore().
  const communityDataForTest = new Proxy({} as CommunityDataBackend, {
    get: (_target, prop) =>
      (
        requireSessionBackends().communityData as unknown as Record<
          string | symbol,
          unknown
        >
      )?.[prop],
  });

  beforeEach(() => {
    const persistence = createMemoryPersistence();
    admin = new CommunityAdminNexus(
      persistence,
      {} as never,
      communityDataForTest,
    );
    channels = new ChannelNexus(persistence, {} as never);
    communities = new CommunityNexus(persistence, {} as never);

    communities.setCommunities([
      {
        id: "c1",
        name: "Test Community",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    communities.setActiveId("c1");

    registerTestCore({
      communities,
      channels,
      authStore: useAuthStore,
      uiStore: useUiStore,
      permissions: {
        getPermissions: () => ({ canManageInvites: true }),
      },
      backends: {
        communityData: {
          createChannel: vi.fn(async () =>
            textChannel({ id: "ch-new", name: "new-channel", position: 1 }),
          ),
        },
      },
    } as unknown as HavenReactCore);
  });

  afterEach(() => {
    resetHavenCore();
    resetSessionBackends();
    useAuthStore.getState().setUser(null);
  });

  it("resetMembersModal clears members modal state", () => {
    admin.getReactiveStore().setState({
      showMembersModal: true,
      membersModalCommunityId: "c1",
      membersModalServerName: "Test Community",
      membersModalMembers: [{ userId: "u1" } as never],
      membersModalLoading: true,
      membersModalError: "oops",
      membersModalCanCreateReports: true,
      membersModalCanManageMembers: true,
      membersModalCanManageBans: true,
      revision: 1,
    });

    admin.resetMembersModal();

    const state = admin.getReactiveStore().getState();
    expect(state.showMembersModal).toBe(false);
    expect(state.membersModalCommunityId).toBeNull();
    expect(state.membersModalServerName).toBe("");
    expect(state.membersModalMembers).toEqual([]);
    expect(state.membersModalLoading).toBe(false);
    expect(state.membersModalError).toBeNull();
    expect(state.membersModalCanCreateReports).toBe(false);
    expect(state.membersModalCanManageMembers).toBe(false);
    expect(state.membersModalCanManageBans).toBe(false);
  });

  it("openServerMembersModal resolves the server name from CommunityNexus", async () => {
    const listCommunityMembers = vi.fn(async () => []);
    const getMyPermissions = vi.fn(async () => ({
      canCreateReports: false,
      canManageMembers: false,
      canManageBans: false,
    }));

    registerTestCore({
      communities,
      channels,
      permissions: {
        getPermissions: () => ({ canManageInvites: true }),
      },
      backends: {
        communityData: {
          listCommunityMembers,
          getMyPermissions,
        },
      },
    } as unknown as HavenReactCore);

    await admin.openServerMembersModal("c1");

    const state = admin.getReactiveStore().getState();
    expect(state.membersModalServerName).toBe("Test Community");
    expect(listCommunityMembers).toHaveBeenCalledWith("c1");
  });

  it("createChannel upserts the new channel in ChannelNexus", async () => {
    useAuthStore.getState().setUser({ id: "u1" } as never);
    channels.setChannels("c1", [textChannel()], {
      groups: [],
      ungroupedChannelIds: ["ch1"],
      collapsedGroupIds: [],
    });

    await admin.createChannel({
      name: "new-channel",
      topic: null,
      kind: "text",
    });

    expect(channels.getChannel("ch-new")?.name).toBe("new-channel");
    expect(channels.getActiveChannelId()).toBe("ch-new");
  });

  it("reorders server roles through the community backend and refreshes role state once", async () => {
    const updateServerRole = vi.fn(async () => {});
    const fetchServerRoleManagement = vi.fn(async () => ({
      roles: [
        role({ id: "r2", name: "Beta", position: 1 }),
        role({ id: "r1", name: "Alpha", position: 0 }),
      ],
      members: [],
      permissionsCatalog: [],
    }));

    registerTestCore({
      communities,
      channels,
      permissions: {
        getPermissions: () => ({ canManageInvites: true }),
      },
      backends: {
        communityData: {
          updateServerRole,
          fetchServerRoleManagement,
        },
      },
    } as unknown as HavenReactCore);

    await admin.reorderServerRoles(
      [
        role({ id: "r2", name: "Beta", position: 0 }),
        role({ id: "r1", name: "Alpha", position: 1 }),
      ],
      "c1",
    );

    expect(updateServerRole).toHaveBeenCalledTimes(2);
    expect(updateServerRole).toHaveBeenCalledWith({
      communityId: "c1",
      roleId: "r2",
      name: "Beta",
      color: "#ffffff",
      position: 1,
    });
    expect(updateServerRole).toHaveBeenCalledWith({
      communityId: "c1",
      roleId: "r1",
      name: "Alpha",
      color: "#ffffff",
      position: 0,
    });
    expect(fetchServerRoleManagement).toHaveBeenCalledTimes(1);
    expect(
      admin
        .getReactiveStore()
        .getState()
        .serverRoles.map((r) => r.id),
    ).toEqual(["r2", "r1"]);
  });
});

const role = (overrides: Partial<ServerRoleItem> = {}): ServerRoleItem => ({
  id: "r1",
  name: "Role",
  color: "#ffffff",
  position: 0,
  isDefault: false,
  isSystem: false,
  permissionKeys: [],
  memberCount: 0,
  ...overrides,
});
