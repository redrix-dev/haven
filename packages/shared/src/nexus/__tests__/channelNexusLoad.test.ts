import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { ChannelNexus } from '@shared/nexus/community/ChannelNexus';
import { CommunityNexus } from '@shared/nexus/community/CommunityNexus';
import type {
  Channel,
  ChannelGroupState,
} from '@shared/lib/backend/types';

const channel = (overrides: Partial<Channel> = {}): Channel =>
  ({
    id: 'c1',
    community_id: 's1',
    name: 'general',
    kind: 'text',
    position: 0,
    topic: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as Channel;

const emptyGroups: ChannelGroupState = {
  groups: [],
  ungroupedChannelIds: [],
  collapsedGroupIds: [],
};

describe('ChannelNexus.loadForCommunity', () => {
  it('throws when backend not attached', async () => {
    const nexus = new ChannelNexus(createMemoryPersistence());
    await expect(nexus.loadForCommunity('s1')).rejects.toThrow(
      /communityData was attached/,
    );
  });

  it('fetches channels and groups and dedupes concurrent calls', async () => {
    const nexus = new ChannelNexus(createMemoryPersistence());
    const listChannels = vi.fn(async () => [channel()]);
    const listChannelGroups = vi.fn(async () => emptyGroups);
    nexus.setCommunityData({
      listChannels,
      listChannelGroups,
    } as never);

    await Promise.all([nexus.loadForCommunity('s1'), nexus.loadForCommunity('s1')]);

    expect(listChannels).toHaveBeenCalledTimes(1);
    expect(listChannelGroups).toHaveBeenCalledTimes(1);
    expect(nexus.getChannelsSnapshot('s1').map((c) => c.id)).toEqual(['c1']);
  });

  it('ensureLoaded skips when already cached', async () => {
    const nexus = new ChannelNexus(createMemoryPersistence());
    const listChannels = vi.fn(async () => [channel()]);
    nexus.setCommunityData({
      listChannels,
      listChannelGroups: vi.fn(async () => emptyGroups),
    } as never);

    await nexus.loadForCommunity('s1');
    await nexus.ensureLoaded('s1');

    expect(listChannels).toHaveBeenCalledTimes(1);
  });

  it('upsertChannel adds a single channel from realtime', () => {
    const nexus = new ChannelNexus(createMemoryPersistence());
    nexus.upsertChannel(channel({ id: 'cNew' }));
    expect(nexus.getChannelsSnapshot('s1').map((c) => c.id)).toEqual(['cNew']);
  });

  it('falls back to empty groups when listChannelGroups rejects', async () => {
    const nexus = new ChannelNexus(createMemoryPersistence());
    nexus.setCommunityData({
      listChannels: vi.fn(async () => [channel()]),
      listChannelGroups: vi.fn(async () => {
        throw new Error('boom');
      }),
    } as never);

    await nexus.loadForCommunity('s1');
    expect(nexus.getChannelsSnapshot('s1')).toHaveLength(1);
  });
});

describe('CommunityNexus.load', () => {
  it('throws when control plane not attached', async () => {
    const nexus = new CommunityNexus(createMemoryPersistence());
    await expect(nexus.load('u1')).rejects.toThrow(/controlPlane was attached/);
  });

  it('replaces the community list from the backend', async () => {
    const nexus = new CommunityNexus(createMemoryPersistence());
    nexus.setControlPlane({
      listUserCommunities: vi.fn(async () => [
        { id: 's1', name: 'haven', created_at: '2024-01-01T00:00:00Z' },
        { id: 's2', name: 'beta', created_at: '2024-01-02T00:00:00Z' },
      ]),
    } as never);

    await nexus.load('u1');

    expect(nexus.getSnapshot('s1')?.name).toBe('haven');
    expect(nexus.getSnapshot('s2')?.name).toBe('beta');
  });
});
