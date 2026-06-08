import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createMemoryPersistence,
  resetHavenCore,
  syncFocusFromRoute,
} from '@shared/core';
import { CommunityNexus } from '@mobile-data/communities/CommunityNexus';
import { ChannelNexus } from '@mobile-data/channels/ChannelNexus';
import { CommunityMessageCache as CommunityMessageNexus } from '@mobile-data/messages/CommunityMessageCache';
import { HavenCore } from '@shared/core/HavenCore';
import type { ServerSummary } from '@shared/lib/backend/types';

/**
 * Bootstrap tests exercise HavenCore.bootstrapSession at the integration level
 * without depending on a real Supabase client. We instantiate the nexuses
 * directly and stub the two surfaces bootstrap touches: control-plane.listUserCommunities
 * and control-plane.subscribeToPrivateUserChannel.
 */

type Listener = (payload: unknown) => void;

const makeFakeCore = (input: {
  listUserCommunities: (userId: string) => Promise<ServerSummary[]>;
  subscribeToPrivateUserChannel?: (
    userId: string,
    listener: Listener,
  ) => () => void;
}): HavenCore => {
  const persistence = createMemoryPersistence();
  const communities = new CommunityNexus(persistence, {} as never);
  const channels = new ChannelNexus(persistence, {} as never);
  const messageNexuses = new Map<string, CommunityMessageNexus>();

  const phase = {
    snapshot: { phase: 'idle' as string, error: null as string | null },
    listeners: new Set<(snapshot: { phase: string; error: string | null }) => void>(),
    set(next: string, error: string | null = null) {
      this.snapshot = { phase: next, error };
      for (const l of this.listeners) l(this.snapshot);
    },
  };

  const core: HavenCore = {
    persistence,
    communities,
    channels,
    messages: {
      for: (id: string) => {
        let n = messageNexuses.get(id);
        if (!n) {
          n = new CommunityMessageNexus(id, persistence);
          messageNexuses.set(id, n);
        }
        return n;
      },
      has: (id: string) => messageNexuses.has(id),
      clearCommunity: (id: string) => {
        messageNexuses.get(id)?.clear();
        messageNexuses.delete(id);
      },
      clearAll: () => {
        for (const n of messageNexuses.values()) n.clear();
        messageNexuses.clear();
      },
    } as unknown as HavenCore['messages'],
    backends: {
      controlPlane: {
        listUserCommunities: input.listUserCommunities,
        subscribeToPrivateUserChannel:
          input.subscribeToPrivateUserChannel ?? (() => () => {}),
      },
      communityData: { listChannelMessages: vi.fn() },
    } as unknown as HavenCore['backends'],
    getBootstrapPhase: () => phase.snapshot as never,
    subscribeBootstrapPhase: ((l: unknown) => {
      const lf = l as (snapshot: { phase: string; error: string | null }) => void;
      phase.listeners.add(lf);
      return () => phase.listeners.delete(lf);
    }) as never,
    routeEvent: vi.fn() as never,
    subscribeRealtime: vi.fn(() => () => {}) as never,
    onRoleChange: vi.fn() as never,
    onNotificationEvent: vi.fn() as never,
    onDmConversationEvent: vi.fn() as never,
    onDmMessageEvent: vi.fn() as never,
    onSocialChange: vi.fn() as never,
    bootstrapSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    prepareTextChannelMessages: vi.fn(async () => {}),
  } as unknown as HavenCore;

  // Provide a real bootstrapSession that drives the same phases as production.
  (core as { bootstrapSession: HavenCore['bootstrapSession'] }).bootstrapSession =
    async (userId: string) => {
      phase.set('rehydrating');
      communities.rehydrate();
      channels.rehydrate();
      phase.set('loading_communities');
      const list = await input.listUserCommunities(userId);
      communities.setCommunities(
        list.map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at })),
      );
      phase.set('connecting_realtime');
      const fakeSubscribe =
        input.subscribeToPrivateUserChannel ?? (() => () => {});
      fakeSubscribe(userId, () => {});
      phase.set('ready');
    };

  return core;
};

beforeEach(() => {
  resetHavenCore();
});

describe('bootstrapSession', () => {
  it('drives phases idle → ready and populates communities', async () => {
    const phases: string[] = [];
    const listUserCommunities = vi.fn(async () => [
      { id: 's1', name: 'Alpha', created_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const core = makeFakeCore({ listUserCommunities });
    const unsubscribe = core.subscribeBootstrapPhase((snapshot) => {
      phases.push(snapshot.phase);
    });

    await core.bootstrapSession('u1');

    expect(phases).toEqual([
      'rehydrating',
      'loading_communities',
      'connecting_realtime',
      'ready',
    ]);
    expect(core.communities.reactiveStore.getState().orderedIds).toContain('s1');
    expect(core.communities.getSnapshot('s1')?.name).toBe('Alpha');
    expect(listUserCommunities).toHaveBeenCalledWith('u1');
    unsubscribe();
  });

  it('subscribes the user private channel during bootstrap', async () => {
    const subscribeToPrivateUserChannel = vi.fn(() => () => {});
    const core = makeFakeCore({
      listUserCommunities: async () => [],
      subscribeToPrivateUserChannel,
    });

    await core.bootstrapSession('u1');

    expect(subscribeToPrivateUserChannel).toHaveBeenCalledWith(
      'u1',
      expect.any(Function),
    );
  });
});

describe('syncFocusFromRoute', () => {
  it('sets community + falls back to default channel when none specified', () => {
    const core = makeFakeCore({ listUserCommunities: async () => [] });
    core.channels.setChannels(
      's1',
      [
        {
          id: 'c1',
          community_id: 's1',
          name: 'general',
          kind: 'text',
          position: 0,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
      ],
      { groups: [], ungroupedChannelIds: ['c1'], collapsedGroupIds: [] },
    );

    syncFocusFromRoute(core, { communityId: 's1' });

    expect(core.communities.getSnapshot).toBeDefined();
    expect(core.channels.getChannelsSnapshot('s1')[0]?.id).toBe('c1');
  });

  it('uses lastChannelByCommunity when present', () => {
    const core = makeFakeCore({ listUserCommunities: async () => [] });
    core.channels.setChannels(
      's1',
      [
        {
          id: 'c1',
          community_id: 's1',
          name: 'general',
          kind: 'text',
          position: 0,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
        {
          id: 'c2',
          community_id: 's1',
          name: 'random',
          kind: 'text',
          position: 1,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
      ],
      { groups: [], ungroupedChannelIds: ['c1', 'c2'], collapsedGroupIds: [] },
    );
    core.channels.setActiveChannelId('c2');

    syncFocusFromRoute(core, { communityId: 's1' });

    expect(core.channels.getLastChannelId('s1')).toBe('c2');
  });

  it('clears active focus when communityId is null', () => {
    const core = makeFakeCore({ listUserCommunities: async () => [] });
    core.channels.setChannels(
      's1',
      [
        {
          id: 'c1',
          community_id: 's1',
          name: 'general',
          kind: 'text',
          position: 0,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
      ],
      { groups: [], ungroupedChannelIds: ['c1'], collapsedGroupIds: [] },
    );
    core.channels.setActiveChannelId('c1');
    core.communities.setActiveId('s1');

    syncFocusFromRoute(core, { communityId: null });

    expect(core.channels.getLastChannelId('s1')).toBe('c1');
  });
});

describe('prepareCommunityEntry', () => {
  it('loads channel focus through the Nexus and prepares the selected text channel', async () => {
    const persistence = createMemoryPersistence();
    const communities = new CommunityNexus(persistence, {} as never);
    const channels = new ChannelNexus(persistence, {} as never);
    channels.setChannels(
      's1',
      [
        {
          id: 'c1',
          community_id: 's1',
          name: 'general',
          kind: 'text',
          position: 0,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
        {
          id: 'c2',
          community_id: 's1',
          name: 'random',
          kind: 'text',
          position: 1,
          topic: null,
          created_at: '2026-01-01T00:00:00.000Z',
        } as never,
      ],
      { groups: [], ungroupedChannelIds: ['c1', 'c2'], collapsedGroupIds: [] },
    );

    const ensureCommunityPermissions = vi.fn(async () => {});
    const prepareTextChannelMessages = vi.fn(async () => {});
    const core = {
      communities,
      channels,
      ensureCommunityPermissions,
      prepareTextChannelMessages,
    } as unknown as HavenCore;

    const result = await HavenCore.prototype.prepareCommunityEntry.call(
      core,
      's1',
      { lastVisitedChannelId: 'c2' },
    );

    expect(result.channelId).toBe('c2');
    expect(communities.getActiveId()).toBe('s1');
    expect(channels.getActiveChannelId()).toBe('c2');
    expect(ensureCommunityPermissions).toHaveBeenCalledWith('s1');
    expect(prepareTextChannelMessages).toHaveBeenCalledWith('s1', 'c2');
  });
});

describe('warmup orchestration', () => {
  const createWarmCore = (): HavenCore =>
    Object.create(HavenCore.prototype) as HavenCore;

  it('warms session surfaces and isolates individual failures', async () => {
    const core = createWarmCore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ensureViewerProfile = vi.fn(async () => {
      throw new Error('profile failed');
    });
    const ensurePlatformStaff = vi.fn(async () => null);
    const ensureInbox = vi.fn(async () => {});
    const ensurePreferences = vi.fn(async () => null);
    const ensureSocial = vi.fn(async () => {});
    const ensureConversationsLoaded = vi.fn(async () => {});
    const ensureMessagesLoaded = vi.fn(async () => {});

    Object.assign(core, {
      profiles: {
        ensureViewerProfile,
        ensurePlatformStaff,
      },
      notifications: {
        ensureInbox,
        ensurePreferences,
      },
      social: {
        ensureLoaded: ensureSocial,
      },
      directMessages: {
        ensureConversationsLoaded,
        ensureMessagesLoaded,
        getConversationsSnapshot: () => [
          { conversationId: 'dm1', unreadCount: 2 },
          { conversationId: 'dm2', unreadCount: 0 },
        ],
      },
    });

    await core.warmSessionSurfaces('u1');

    expect(ensureViewerProfile).toHaveBeenCalledWith('u1', {
      freshnessMs: 60_000,
    });
    expect(ensurePlatformStaff).toHaveBeenCalledWith('u1', {
      freshnessMs: 60_000,
    });
    expect(ensureInbox).toHaveBeenCalledTimes(1);
    expect(ensurePreferences).toHaveBeenCalledTimes(1);
    expect(ensureSocial).toHaveBeenCalledTimes(1);
    expect(ensureConversationsLoaded).toHaveBeenCalled();
    expect(ensureMessagesLoaded).toHaveBeenCalledWith('dm1', {
      freshnessMs: undefined,
    });
    expect(ensureMessagesLoaded).not.toHaveBeenCalledWith('dm2', expect.anything());
    expect(warn).toHaveBeenCalledWith(
      '[HavenCore warmup] viewer profile failed',
      expect.any(Error),
    );

    warn.mockRestore();
  });

  it('warms only capped unread DM threads without marking read', async () => {
    const core = createWarmCore();
    const ensureMessagesLoaded = vi.fn(async () => {});
    const markRead = vi.fn(async () => true);

    Object.assign(core, {
      directMessages: {
        ensureConversationsLoaded: vi.fn(async () => {}),
        ensureMessagesLoaded,
        markRead,
        getConversationsSnapshot: () => [
          { conversationId: 'dm1', unreadCount: 1 },
          { conversationId: 'dm2', unreadCount: 0 },
          { conversationId: 'dm3', unreadCount: 4 },
          { conversationId: 'dm4', unreadCount: 2 },
          { conversationId: 'dm5', unreadCount: 1 },
        ],
      },
    });

    await core.warmDirectMessageThreads({ unreadOnly: true, limit: 3 });

    expect(ensureMessagesLoaded).toHaveBeenCalledTimes(3);
    expect(ensureMessagesLoaded).toHaveBeenNthCalledWith(1, 'dm1', {
      freshnessMs: undefined,
    });
    expect(ensureMessagesLoaded).toHaveBeenNthCalledWith(2, 'dm3', {
      freshnessMs: undefined,
    });
    expect(ensureMessagesLoaded).toHaveBeenNthCalledWith(3, 'dm4', {
      freshnessMs: undefined,
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it('warms the active community channel and bounded adjacent text channels', async () => {
    const core = createWarmCore();
    const prepareTextChannelMessages = vi.fn(async () => {});

    Object.assign(core, {
      channels: {
        ensureLoaded: vi.fn(async () => {}),
        getActiveChannelId: () => 'c2',
        setActiveChannelId: vi.fn(),
        getChannelsSnapshot: () => [
          {
            id: 'c1',
            communityId: 's1',
            name: 'one',
            kind: 'text',
            position: 0,
            topic: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c2',
            communityId: 's1',
            name: 'two',
            kind: 'text',
            position: 1,
            topic: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c3',
            communityId: 's1',
            name: 'three',
            kind: 'text',
            position: 2,
            topic: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c4',
            communityId: 's1',
            name: 'voice',
            kind: 'voice',
            position: 3,
            topic: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c5',
            communityId: 's1',
            name: 'five',
            kind: 'text',
            position: 4,
            topic: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      communities: {
        setActiveId: vi.fn(),
      },
      ensureCommunityPermissions: vi.fn(async () => {}),
      prepareTextChannelMessages,
    });

    await core.warmCommunitySurface('s1');
    await Promise.resolve();

    expect(prepareTextChannelMessages).toHaveBeenCalledWith('s1', 'c2');
    expect(prepareTextChannelMessages).toHaveBeenCalledWith('s1', 'c1');
    expect(prepareTextChannelMessages).toHaveBeenCalledWith('s1', 'c3');
    expect(prepareTextChannelMessages).not.toHaveBeenCalledWith('s1', 'c5');
  });
});

describe('deleteCommunityMessageForModeration', () => {
  it('delegates community message deletion to the community data backend', async () => {
    const deleteMessage = vi.fn(async () => {});
    const core = {
      backends: {
        communityData: { deleteMessage },
      },
    } as unknown as HavenCore;

    await HavenCore.prototype.deleteCommunityMessageForModeration.call(core, {
      communityId: 's1',
      messageId: 'm1',
    });

    expect(deleteMessage).toHaveBeenCalledWith({
      communityId: 's1',
      messageId: 'm1',
    });
  });
});
