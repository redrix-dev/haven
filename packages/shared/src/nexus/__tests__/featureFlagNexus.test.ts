import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { FeatureFlagNexus } from '@shared/nexus/feature-flags/FeatureFlagNexus';

describe('FeatureFlagNexus', () => {
  it('loads feature flags and exposes flag checks', async () => {
    const listMyFeatureFlags = vi.fn(async () => ({
      rich_composer: true,
      disabled_flag: false,
    }));
    const nexus = new FeatureFlagNexus(createMemoryPersistence(), {
      listMyFeatureFlags,
    });

    await nexus.load();

    expect(listMyFeatureFlags).toHaveBeenCalledTimes(1);
    expect(nexus.getLoaded()).toBe(true);
    expect(nexus.has('rich_composer')).toBe(true);
    expect(nexus.has('disabled_flag')).toBe(false);
    expect(nexus.getFlags()).toEqual({
      rich_composer: true,
      disabled_flag: false,
    });
  });

  it('dedupes concurrent loads', async () => {
    const listMyFeatureFlags = vi.fn(async () => ({ alpha: true }));
    const nexus = new FeatureFlagNexus(createMemoryPersistence(), {
      listMyFeatureFlags,
    });

    await Promise.all([nexus.load(), nexus.load()]);

    expect(listMyFeatureFlags).toHaveBeenCalledTimes(1);
  });

  it('records load errors and resets state', async () => {
    const listMyFeatureFlags = vi.fn(async () => {
      throw new Error('flag service down');
    });
    const nexus = new FeatureFlagNexus(createMemoryPersistence(), {
      listMyFeatureFlags,
    });

    await expect(nexus.load()).rejects.toThrow('flag service down');
    expect(nexus.getLoaded()).toBe(true);
    expect(nexus.getError()).toBe('flag service down');

    nexus.reset();

    expect(nexus.getLoaded()).toBe(false);
    expect(nexus.getError()).toBeNull();
    expect(nexus.getFlags()).toEqual({});
  });
});
