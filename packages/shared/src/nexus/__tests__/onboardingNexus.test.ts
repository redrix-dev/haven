import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { OnboardingNexus } from '@mobile-data/onboarding/OnboardingNexus';
import type { OnboardingClientContext } from '@shared/lib/backend/types';

const context: OnboardingClientContext = {
  platform: 'ios',
  distribution: 'all',
  appVersion: '0.0.0',
};

describe('OnboardingNexus', () => {
  it('loads available campaigns', async () => {
    const listMyOnboardingCampaigns = vi.fn(async () => [
      {
        key: 'alpha_2026',
        featureFlagKey: 'mobile_onboarding_alpha',
        title: 'Join the Haven Alpha',
        description: null,
        required: true,
        targetCommunityId: 'community-1',
        targetFlairKey: 'alpha',
        platformScope: 'all' as const,
        distributionScope: 'all' as const,
        sortOrder: 10,
      },
    ]);
    const completeOnboardingCampaign = vi.fn();
    const nexus = new OnboardingNexus(createMemoryPersistence(), {
      listMyOnboardingCampaigns,
      completeOnboardingCampaign,
    });

    await nexus.load(context);

    expect(listMyOnboardingCampaigns).toHaveBeenCalledWith(context);
    expect(nexus.getLoaded()).toBe(true);
    expect(nexus.getCampaigns()).toHaveLength(1);
    expect(nexus.getCampaigns()[0]?.key).toBe('alpha_2026');
  });

  it('dedupes concurrent loads', async () => {
    const listMyOnboardingCampaigns = vi.fn(async () => []);
    const nexus = new OnboardingNexus(createMemoryPersistence(), {
      listMyOnboardingCampaigns,
      completeOnboardingCampaign: vi.fn(),
    });

    await Promise.all([nexus.load(context), nexus.load(context)]);

    expect(listMyOnboardingCampaigns).toHaveBeenCalledTimes(1);
  });

  it('completes a campaign and removes it from available campaigns', async () => {
    const listMyOnboardingCampaigns = vi.fn(async () => [
      {
        key: 'alpha_2026',
        featureFlagKey: 'mobile_onboarding_alpha',
        title: 'Join the Haven Alpha',
        description: null,
        required: true,
        targetCommunityId: 'community-1',
        targetFlairKey: 'alpha',
        platformScope: 'all' as const,
        distributionScope: 'all' as const,
        sortOrder: 10,
      },
    ]);
    const completeOnboardingCampaign = vi.fn(async () => ({
      campaignKey: 'alpha_2026',
      status: 'completed' as const,
      communityId: 'community-1',
      communityName: 'Alpha',
      joined: true,
    }));
    const nexus = new OnboardingNexus(createMemoryPersistence(), {
      listMyOnboardingCampaigns,
      completeOnboardingCampaign,
    });

    await nexus.load(context);
    const result = await nexus.complete('alpha_2026', context);

    expect(completeOnboardingCampaign).toHaveBeenCalledWith('alpha_2026', context);
    expect(result.communityId).toBe('community-1');
    expect(nexus.getCampaigns()).toEqual([]);
    expect(nexus.getCompletionError()).toBeNull();
  });

  it('records completion errors and resets state', async () => {
    const nexus = new OnboardingNexus(createMemoryPersistence(), {
      listMyOnboardingCampaigns: vi.fn(async () => []),
      completeOnboardingCampaign: vi.fn(async () => {
        throw new Error('community missing');
      }),
    });

    await expect(nexus.complete('alpha_2026', context)).rejects.toThrow(
      'community missing',
    );
    expect(nexus.getCompletionError()).toBe('community missing');

    nexus.reset();

    expect(nexus.getLoaded()).toBe(false);
    expect(nexus.getCampaigns()).toEqual([]);
    expect(nexus.getCompletionError()).toBeNull();
  });
});
