import { describe, expect, it } from 'vitest';
import { createRoot } from 'solid-js';
import { createMemoryPersistence } from '@shared/core';
import { CommunityNexus } from '@shared/nexus/community/CommunityNexus';
import {
  createActiveCommunityId,
  createOrderedCommunities,
} from '@solid-bindings';

/**
 * Approach-C Solid coverage for CommunityNexus — focuses on the COMPOSED
 * binding (`createOrderedCommunities`), which folds two reactive sources
 * (projectCommunities + selectDisplayOrderIds) through the shared pure
 * `applyCommunityDisplayOrder` projection. Proves the composition reacts to
 * BOTH the community list and the display-order changing.
 */

const community = (id: string, name: string) => ({
  id,
  name,
  createdAt: '2024-01-01T00:00:00Z',
});

describe('CommunityNexus → @solid-bindings (composed)', () => {
  it('createOrderedCommunities reacts to list + display-order changes', () => {
    createRoot((dispose) => {
      const nexus = new CommunityNexus(createMemoryPersistence(), {} as never);
      const ordered = createOrderedCommunities(nexus);

      expect(ordered()).toEqual([]);

      nexus.setCommunities([community('a', 'Alpha'), community('b', 'Beta')]);
      expect(ordered().map((c) => c.id)).toEqual(['a', 'b']);

      // a saved display order reverses them — the composed memo must re-fold
      nexus.setDisplayOrder(['b', 'a'], null);
      expect(ordered().map((c) => c.id)).toEqual(['b', 'a']);

      dispose();
    });
  });

  it('createActiveCommunityId reacts to setActiveId', () => {
    createRoot((dispose) => {
      const nexus = new CommunityNexus(createMemoryPersistence(), {} as never);
      const activeId = createActiveCommunityId(nexus);

      expect(activeId()).toBeNull();

      nexus.setActiveId('a');
      expect(activeId()).toBe('a');

      dispose();
    });
  });
});
