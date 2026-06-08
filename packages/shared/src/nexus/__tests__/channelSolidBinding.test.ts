import { describe, expect, it } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createMemoryPersistence } from '@shared/core';
import { ChannelNexus } from '@shared/nexus/community/ChannelNexus';
import {
  createActiveChannelId,
  createChannels,
} from '@solid-bindings';
import type { Channel, ChannelGroupState } from '@shared/lib/backend/types';

/**
 * Approach-C pressure test on the Solid side.
 *
 * Proves the SAME framework-agnostic ChannelNexus (vanilla store + the shared
 * `projectChannels` projection) drives a Solid reactive graph through
 * `@solid-bindings` — no React anywhere — and that getter ids are tracked at
 * access time. This is the cross-framework half of the binding contract; the
 * React half is exercised by the web/electron call sites + typecheck.
 */

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

describe('ChannelNexus → @solid-bindings (approach C)', () => {
  it('createChannels reacts to store mutations', () => {
    createRoot((dispose) => {
      const nexus = new ChannelNexus(createMemoryPersistence(), {} as never);
      const channels = createChannels(nexus, () => 's1');

      expect(channels()).toEqual([]);

      nexus.setChannels('s1', [channel()], emptyGroups);
      expect(channels().map((c) => c.id)).toEqual(['c1']);

      dispose();
    });
  });

  it('createChannels tracks a getter id at access time', () => {
    createRoot((dispose) => {
      const nexus = new ChannelNexus(createMemoryPersistence(), {} as never);
      nexus.setChannels('s1', [channel()], emptyGroups);
      nexus.setChannels('s2', [channel({ id: 'c2', community_id: 's2' })], emptyGroups);

      const [communityId, setCommunityId] = createSignal('s1');
      const channels = createChannels(nexus, communityId);

      expect(channels().map((c) => c.id)).toEqual(['c1']);

      setCommunityId('s2');
      expect(channels().map((c) => c.id)).toEqual(['c2']);

      dispose();
    });
  });

  it('createActiveChannelId reacts to setActiveChannelId', () => {
    createRoot((dispose) => {
      const nexus = new ChannelNexus(createMemoryPersistence(), {} as never);
      nexus.setChannels('s1', [channel()], emptyGroups);
      const activeId = createActiveChannelId(nexus);

      expect(activeId()).toBeNull();

      nexus.setActiveChannelId('c1');
      expect(activeId()).toBe('c1');

      dispose();
    });
  });
});
