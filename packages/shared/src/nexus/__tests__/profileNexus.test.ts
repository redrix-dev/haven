import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { ProfileNexus } from '@shared/nexus/profile/ProfileNexus';

describe('ProfileNexus', () => {
  it('loads the viewer profile and mirrors it into live profile identity state', async () => {
    const fetchUserProfile = vi.fn(async () => ({
      username: 'cody',
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'default',
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
    expect(nexus.getViewerProfile('u1')?.username).toBe('next-cody');
    expect(nexus.getProfile('u1')?.username).toBe('next-cody');
  });
});
