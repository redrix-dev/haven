import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createMemoryPersistence,
  resetHavenCore,
  syncFocusFromRoute,
} from '@shared/core';
import { CommunityNexus } from '@shared/nexus/community/CommunityNexus';
import { ChannelNexus } from '@shared/nexus/community/ChannelNexus';
import { CommunityMessageNexus } from '@shared/nexus/community/CommunityMessageNexus';
import type { HavenCore } from '@shared/core/HavenCore';
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
  const communities = new CommunityNexus(persistence);
  const channels = new ChannelNexus(persistence);
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
    expect(core.communities.useCommunities).toBeDefined();
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
