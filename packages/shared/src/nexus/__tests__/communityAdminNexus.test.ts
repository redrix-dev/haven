import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createMemoryPersistence,
  registerHavenCore,
  resetHavenCore,
} from '@shared/core';
import type { HavenCore } from '@shared/core/HavenCore';
import { ChannelNexus } from '@shared/nexus/community/ChannelNexus';
import { CommunityAdminNexus } from '@shared/nexus/community/CommunityAdminNexus';
import { CommunityNexus } from '@shared/nexus/community/CommunityNexus';
import type { Channel } from '@shared/lib/backend/types';
import { useAuthStore } from '@shared/stores/authStore';

const textChannel = (overrides: Partial<Channel> = {}): Channel =>
  ({
    id: 'ch1',
    community_id: 'c1',
    name: 'general',
    kind: 'text',
    position: 0,
    topic: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Channel;

describe('CommunityAdminNexus', () => {
  let admin: CommunityAdminNexus;
  let channels: ChannelNexus;
  let communities: CommunityNexus;

  beforeEach(() => {
    const persistence = createMemoryPersistence();
    admin = new CommunityAdminNexus(persistence, {} as never);
    channels = new ChannelNexus(persistence, {} as never);
    communities = new CommunityNexus(persistence, {} as never);

    communities.setCommunities([
      {
        id: 'c1',
        name: 'Test Community',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    communities.setActiveId('c1');

    registerHavenCore({
      communities,
      channels,
      permissions: {
        getPermissions: () => ({ canManageInvites: true }),
      },
      backends: {
        communityData: {
          createChannel: vi.fn(async () =>
            textChannel({ id: 'ch-new', name: 'new-channel', position: 1 }),
          ),
        },
      },
    } as unknown as HavenCore);
  });

  afterEach(() => {
    resetHavenCore();
    useAuthStore.getState().setUser(null);
  });

  it('resetMembersModal clears members modal state', () => {
    admin.getReactiveStore().setState({
      showMembersModal: true,
      membersModalCommunityId: 'c1',
      membersModalServerName: 'Test Community',
      membersModalMembers: [{ userId: 'u1' } as never],
      membersModalLoading: true,
      membersModalError: 'oops',
      membersModalCanCreateReports: true,
      membersModalCanManageMembers: true,
      membersModalCanManageBans: true,
      revision: 1,
    });

    admin.resetMembersModal();

    const state = admin.getReactiveStore().getState();
    expect(state.showMembersModal).toBe(false);
    expect(state.membersModalCommunityId).toBeNull();
    expect(state.membersModalServerName).toBe('');
    expect(state.membersModalMembers).toEqual([]);
    expect(state.membersModalLoading).toBe(false);
    expect(state.membersModalError).toBeNull();
    expect(state.membersModalCanCreateReports).toBe(false);
    expect(state.membersModalCanManageMembers).toBe(false);
    expect(state.membersModalCanManageBans).toBe(false);
  });

  it('openServerMembersModal resolves the server name from CommunityNexus', async () => {
    const listCommunityMembers = vi.fn(async () => []);
    const getMyPermissions = vi.fn(async () => ({
      canCreateReports: false,
      canManageMembers: false,
      canManageBans: false,
    }));

    registerHavenCore({
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
    } as unknown as HavenCore);

    await admin.openServerMembersModal('c1');

    const state = admin.getReactiveStore().getState();
    expect(state.membersModalServerName).toBe('Test Community');
    expect(listCommunityMembers).toHaveBeenCalledWith('c1');
  });

  it('createChannel upserts the new channel in ChannelNexus', async () => {
    useAuthStore.getState().setUser({ id: 'u1' } as never);
    channels.setChannels('c1', [textChannel()], {
      groups: [],
      ungroupedChannelIds: ['ch1'],
      collapsedGroupIds: [],
    });

    await admin.createChannel({
      name: 'new-channel',
      topic: null,
      kind: 'text',
    });

    expect(channels.getChannel('ch-new')?.name).toBe('new-channel');
    expect(channels.getActiveChannelId()).toBe('ch-new');
  });
});
