import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryPersistence,
  routeRealtimeEvent,
  type HavenBackends,
} from '@shared/core';
import { ChannelNexus } from '@mobile-data/channels/ChannelNexus';
import { CommunityNexus } from '@mobile-data/communities/CommunityNexus';
import { CommunityMessageCache as CommunityMessageNexus } from '@mobile-data/messages/CommunityMessageCache';
import { ProfileNexus } from '@mobile-data/profile/ProfileNexus';
import type { RealtimeEvent, RealtimeMutationTarget } from '@shared/core';
import type { MessageBundle } from '@shared/lib/backend/types';

type FakeCore = {
  communities: CommunityNexus;
  channels: ChannelNexus;
  profiles: ProfileNexus;
  messages: {
    for(communityId: string): CommunityMessageNexus;
    has(communityId: string): boolean;
    clearCommunity(communityId: string): void;
    clearAll(): void;
  };
  backends: { communityData: Pick<HavenBackends['communityData'], 'getChannelMessage'> };
  routeEvent: (evt: RealtimeEvent) => void;
  onRoleChange: ReturnType<typeof vi.fn>;
  onNotificationEvent: ReturnType<typeof vi.fn>;
  onDmConversationEvent: ReturnType<typeof vi.fn>;
  onDmMessageEvent: ReturnType<typeof vi.fn>;
  onSocialChange: ReturnType<typeof vi.fn>;
};

const buildFakeCore = (
  getChannelMessage: HavenBackends['communityData']['getChannelMessage'],
): FakeCore => {
  const persistence = createMemoryPersistence();
  const communities = new CommunityNexus(persistence, {} as never);
  const channels = new ChannelNexus(persistence, {} as never);
  const profiles = new ProfileNexus(persistence);
  const messageNexuses = new Map<string, CommunityMessageNexus>();

  const core: FakeCore = {
    communities,
    channels,
    profiles,
    messages: {
      for: (communityId: string) => {
        let nexus = messageNexuses.get(communityId);
        if (!nexus) {
          nexus = new CommunityMessageNexus(communityId, persistence);
          messageNexuses.set(communityId, nexus);
        }
        return nexus;
      },
      has: (communityId: string) => messageNexuses.has(communityId),
      clearCommunity: (communityId: string) => {
        const nexus = messageNexuses.get(communityId);
        if (nexus) {
          nexus.clear();
          messageNexuses.delete(communityId);
        }
      },
      clearAll: () => {
        for (const nexus of messageNexuses.values()) nexus.clear();
        messageNexuses.clear();
      },
    },
    backends: { communityData: { getChannelMessage } },
    routeEvent: (evt) => routeRealtimeEvent(core as unknown as RealtimeMutationTarget, evt),
    onRoleChange: vi.fn(),
    onNotificationEvent: vi.fn(),
    onDmConversationEvent: vi.fn(),
    onDmMessageEvent: vi.fn(),
    onSocialChange: vi.fn(),
  };

  return core;
};

const completeBundle = (overrides: Partial<MessageBundle>): MessageBundle =>
  ({
    id: 'msg-1',
    channelId: 'ch-1',
    authorUserId: 'user-1',
    displayName: 'User',
    avatarSnapshotUrl: null,
    content: 'hello',
    metadata: {},
    replyToMessageId: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    isHidden: false,
    isPlatformStaff: false,
    reactions: [],
    attachment: null,
    linkPreview: null,
    ...overrides,
  }) as MessageBundle;

describe('routeRealtimeEvent', () => {
  it('MESSAGE_INSERT inserts partial then hydrates from backend', async () => {
    const full = completeBundle({ id: 'msg-new', content: 'full body' });
    const getChannelMessage = vi.fn().mockResolvedValue(full);
    const core = buildFakeCore(getChannelMessage);

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'MESSAGE_INSERT',
      payload: {
        community_id: 'srv-1',
        channel_id: 'ch-1',
        message_id: 'msg-new',
        author_user_id: 'user-1',
        content: 'partial',
        created_at: full.createdAt,
      },
    });

    const nexus = core.messages.for('srv-1');
    expect(nexus.getSnapshot('msg-new')?.content).toBe('partial');

    await vi.waitFor(() => {
      expect(getChannelMessage).toHaveBeenCalledWith({
        communityId: 'srv-1',
        channelId: 'ch-1',
        messageId: 'msg-new',
      });
      expect(nexus.getSnapshot('msg-new')?.content).toBe('full body');
    });
  });

  it('MESSAGE_INSERT hydrates stale optimistic staff state from the exact backend row', async () => {
    const full = completeBundle({
      id: 'msg-staff',
      content: 'staff body',
      isPlatformStaff: true,
      displayName: 'Cody',
    });
    const getChannelMessage = vi.fn().mockResolvedValue(full);
    const core = buildFakeCore(getChannelMessage);
    const nexus = core.messages.for('srv-1');
    nexus.insertMessage(
      completeBundle({
        id: 'msg-staff',
        content: 'optimistic',
        displayName: '…',
        isPlatformStaff: false,
      }),
    );

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'MESSAGE_INSERT',
      payload: {
        community_id: 'srv-1',
        channel_id: 'ch-1',
        message_id: 'msg-staff',
        author_user_id: 'user-1',
        content: 'optimistic',
        created_at: full.createdAt,
      },
    });

    await vi.waitFor(() => {
      const snapshot = nexus.getSnapshot('msg-staff');
      expect(snapshot?.content).toBe('staff body');
      expect(snapshot?.displayName).toBe('Cody');
      expect(snapshot?.isPlatformStaff).toBe(true);
    });
  });

  it('MESSAGE_UPDATE upserts backend rows that are not already cached', async () => {
    const full = completeBundle({ id: 'msg-update', content: 'edited body' });
    const getChannelMessage = vi.fn().mockResolvedValue(full);
    const core = buildFakeCore(getChannelMessage);
    const nexus = core.messages.for('srv-1');

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'MESSAGE_UPDATE',
      payload: {
        community_id: 'srv-1',
        channel_id: 'ch-1',
        message_id: 'msg-update',
      },
    });

    await vi.waitFor(() => {
      expect(nexus.getSnapshot('msg-update')?.content).toBe('edited body');
    });
  });

  it('MESSAGE_DELETE removes message from channel', () => {
    const core = buildFakeCore(vi.fn());
    const nexus = core.messages.for('srv-1');
    nexus.insertMessage(completeBundle({ id: 'msg-del' }));

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'MESSAGE_DELETE',
      payload: {
        community_id: 'srv-1',
        channel_id: 'ch-1',
        message_id: 'msg-del',
      },
    });

    expect(nexus.getSnapshot('msg-del')).toBeUndefined();
  });

  it('PROFILE_IDENTITY_CHANGE upserts and deletes profiles', () => {
    const core = buildFakeCore(vi.fn());

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'PROFILE_IDENTITY_CHANGE',
      payload: {
        event: 'INSERT',
        user_id: 'user-2',
        username: 'alice',
        avatar_url: null,
        updated_at: new Date().toISOString(),
      },
    });

    expect(core.profiles.getProfile('user-2')?.username).toBe('alice');

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'PROFILE_IDENTITY_CHANGE',
      payload: {
        event: 'DELETE',
        user_id: 'user-2',
      },
    });

    expect(core.profiles.getProfile('user-2')).toBeUndefined();
  });

  it('CHANNEL_GROUP_CHANGE reloads channel groups for a community', async () => {
    const loadForCommunity = vi.fn().mockResolvedValue(undefined);
    const core = buildFakeCore(vi.fn());
    core.channels.loadForCommunity = loadForCommunity;

    routeRealtimeEvent(core as unknown as RealtimeMutationTarget, {
      type: 'CHANNEL_GROUP_CHANGE',
      payload: { community_id: 'srv-1' },
    });

    await vi.waitFor(() => {
      expect(loadForCommunity).toHaveBeenCalledWith('srv-1');
    });
  });
});
