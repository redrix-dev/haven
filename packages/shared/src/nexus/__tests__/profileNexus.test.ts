import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { ProfileNexus } from '@mobile-data/profile/ProfileNexus';

describe('ProfileNexus', () => {
  it('loads the viewer profile and mirrors it into live profile identity state', async () => {
    const fetchUserProfile = vi.fn(async () => ({
      username: 'cody',
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'default',
      profileVisibility: 'private' as const,
      profileBio: null,
      activeFlair: null,
    }));
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      fetchUserProfile,
    } as never);

    const profile = await nexus.loadViewerProfile('u1');

    expect(fetchUserProfile).toHaveBeenCalledWith('u1');
    expect(profile?.username).toBe('cody');
    expect(nexus.getViewerProfile('u1')?.avatarUrl).toBe(
      'https://example.com/avatar.png',
    );
    expect(nexus.getProfile('u1')?.username).toBe('cody');
  });

  it('updates the viewer profile through the control plane and upserts live identity', async () => {
    const updateUserProfile = vi.fn(async () => ({
      username: 'next-cody',
      avatarUrl: null,
      theme: 'midnight',
      profileVisibility: 'public' as const,
      profileBio: 'Hello there',
      activeFlair: {
        userFlairId: 'uf1',
        flairId: 'f1',
        key: 'alpha_2026',
        label: 'Alpha',
        description: null,
        colorToken: 'primary',
        backgroundToken: 'surface-card',
        iconKey: 'sparkles',
      },
    }));
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      updateUserProfile,
    } as never);

    const result = await nexus.updateViewerProfile({
      userId: 'u1',
      username: 'next-cody',
      avatarUrl: null,
      avatarFile: new ArrayBuffer(1),
      avatarContentType: 'image/jpeg',
      theme: 'midnight',
    });

    expect(updateUserProfile).toHaveBeenCalledWith({
      userId: 'u1',
      username: 'next-cody',
      avatarUrl: null,
      avatarFile: expect.any(ArrayBuffer),
      avatarContentType: 'image/jpeg',
      theme: 'midnight',
    });
    expect(result.theme).toBe('midnight');
    expect(result.profileVisibility).toBe('public');
    expect(nexus.getViewerProfile('u1')?.username).toBe('next-cody');
    expect(nexus.getProfile('u1')?.username).toBe('next-cody');
    expect(nexus.getProfileCard('u1')?.details?.bio).toBe('Hello there');
    expect(nexus.getProfileCard('u1')?.details?.activeFlair?.key).toBe('alpha_2026');
  });

  it('loads and changes owned user flairs through the control plane', async () => {
    const grant = {
      userFlairId: 'uf1',
      flairId: 'f1',
      key: 'alpha_2026',
      label: 'Alpha',
      description: null,
      colorToken: 'primary',
      backgroundToken: 'surface-card',
      iconKey: 'sparkles',
      scope: 'platform' as const,
      communityId: null,
      grantSource: 'manual',
      sourceCommunityId: null,
      grantedAt: '2026-06-03T00:00:00.000Z',
      expiresAt: null,
      isAvailable: true,
      isSelected: false,
    };
    const listMyUserFlairs = vi
      .fn()
      .mockResolvedValueOnce([grant])
      .mockResolvedValueOnce([{ ...grant, isSelected: true }]);
    const setActiveUserFlair = vi.fn(async () => undefined);
    const fetchUserProfile = vi.fn(async () => ({
      username: 'cody',
      avatarUrl: null,
      theme: 'default',
      profileVisibility: 'public' as const,
      profileBio: null,
      activeFlair: {
        userFlairId: 'uf1',
        flairId: 'f1',
        key: 'alpha_2026',
        label: 'Alpha',
        description: null,
        colorToken: 'primary',
        backgroundToken: 'surface-card',
        iconKey: 'sparkles',
      },
    }));
    const fetchProfileCard = vi.fn(async () => ({
      userId: 'u1',
      username: 'cody',
      avatarUrl: null,
      profileVisibility: 'public' as const,
      canViewDetails: true,
      details: {
        bio: null,
        activeFlair: {
          userFlairId: 'uf1',
          flairId: 'f1',
          key: 'alpha_2026',
          label: 'Alpha',
          description: null,
          colorToken: 'primary',
          backgroundToken: 'surface-card',
          iconKey: 'sparkles',
        },
      },
    }));
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      listMyUserFlairs,
      setActiveUserFlair,
      fetchUserProfile,
      fetchProfileCard,
    } as never);

    await nexus.loadMyUserFlairs('u1');
    expect(nexus.getUserFlairGrants('u1')[0]?.key).toBe('alpha_2026');

    await nexus.setActiveUserFlair('u1', 'uf1');

    expect(setActiveUserFlair).toHaveBeenCalledWith('uf1');
    expect(nexus.getUserFlairGrants('u1')[0]?.isSelected).toBe(true);
    expect(nexus.getViewerProfile('u1')?.activeFlair?.key).toBe('alpha_2026');
    expect(nexus.getProfileCard('u1')?.details?.activeFlair?.key).toBe('alpha_2026');
  });

  it('loads profile cards separately from live identity state', async () => {
    const fetchProfileCard = vi.fn(async () => ({
      userId: 'u2',
      username: 'visible-user',
      avatarUrl: 'https://example.com/card.png',
      profileVisibility: 'friends_only' as const,
      canViewDetails: false,
      details: null,
    }));
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      fetchProfileCard,
    } as never);

    const card = await nexus.loadProfileCard('u2');

    expect(fetchProfileCard).toHaveBeenCalledWith('u2');
    expect(card?.profileVisibility).toBe('friends_only');
    expect(card?.canViewDetails).toBe(false);
    expect(nexus.getProfileCard('u2')?.username).toBe('visible-user');
    expect(nexus.getProfile('u2')?.avatarUrl).toBe('https://example.com/card.png');
  });

  it('tracks profile card load errors and clears them', async () => {
    const fetchProfileCard = vi.fn(async () => {
      throw new Error('profile card unavailable');
    });
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      fetchProfileCard,
    } as never);

    await expect(nexus.loadProfileCard('u2')).rejects.toThrow(
      'profile card unavailable',
    );

    expect(nexus.getProfileCard('u2')).toBeUndefined();
    expect(nexus.getProfileCardError('u2')).toBe('profile card unavailable');

    nexus.clear();

    expect(nexus.getProfileCard('u2')).toBeUndefined();
    expect(nexus.getProfileCardError('u2')).toBeNull();
  });

  it('loads platform staff info through the control plane', async () => {
    const fetchPlatformStaff = vi.fn(async () => ({
      isActive: true,
      displayPrefix: 'Staff',
    }));
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      fetchPlatformStaff,
    } as never);

    const staff = await nexus.loadPlatformStaff('u1');

    expect(fetchPlatformStaff).toHaveBeenCalledWith('u1');
    expect(staff?.displayPrefix).toBe('Staff');
    expect(nexus.getPlatformStaff('u1')?.isActive).toBe(true);
  });

  it('tracks platform staff load errors and clears session profile state', async () => {
    const fetchPlatformStaff = vi.fn(async () => {
      throw new Error('staff unavailable');
    });
    const nexus = new ProfileNexus(createMemoryPersistence(), {
      fetchPlatformStaff,
    } as never);

    await expect(nexus.loadPlatformStaff('u1')).rejects.toThrow(
      'staff unavailable',
    );

    expect(nexus.getPlatformStaff('u1')).toBeUndefined();
    expect(nexus.getPlatformStaffError('u1')).toBe('staff unavailable');

    nexus.clear();

    expect(nexus.getViewerProfile('u1')).toBeUndefined();
    expect(nexus.getPlatformStaff('u1')).toBeUndefined();
    expect(nexus.getPlatformStaffError('u1')).toBeNull();
  });
});
