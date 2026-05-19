import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryPersistence,
  routeRealtimeEvent,
  type HavenBackends,
} from '@shared/core';
import { ChannelNexus } from '@shared/nexus/community/ChannelNexus';
import { CommunityNexus } from '@shared/nexus/community/CommunityNexus';
import { CommunityMessageNexus } from '@shared/nexus/community/CommunityMessageNexus';
import type { HavenCore } from '@shared/core/HavenCore';
import type { MessageBundle } from '@shared/lib/backend/types';

type FakeCore = Pick<
  HavenCore,
  'communities' | 'channels' | 'messages' | 'routeEvent'
> & {
  backends: { communityData: Pick<HavenBackends['communityData'], 'listChannelMessages'> };
  onRoleChange: HavenCore['onRoleChange'];
  onNotificationEvent: HavenCore['onNotificationEvent'];
  onDmConversationEvent: HavenCore['onDmConversationEvent'];
  onDmMessageEvent: HavenCore['onDmMessageEvent'];
  onSocialChange: HavenCore['onSocialChange'];
};

const buildFakeCore = (
  listChannelMessages: HavenBackends['communityData']['listChannelMessages'],
): FakeCore => {
  const persistence = createMemoryPersistence();
  const communities = new CommunityNexus(persistence);
  const channels = new ChannelNexus(persistence);
  const messageNexuses = new Map<string, CommunityMessageNexus>();

  const core: FakeCore = {
    communities,
    channels,
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
    } as unknown as HavenCore['messages'],
    backends: { communityData: { listChannelMessages } },
    routeEvent: (evt) => routeRealtimeEvent(core as unknown as HavenCore, evt),
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
    const listChannelMessages = vi.fn().mockResolvedValue({
      messages: [full],
      hasMore: false,
    });
    const core = buildFakeCore(listChannelMessages);

    routeRealtimeEvent(core as unknown as HavenCore, {
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
      expect(listChannelMessages).toHaveBeenCalled();
      expect(nexus.getSnapshot('msg-new')?.content).toBe('full body');
    });
  });

  it('MESSAGE_DELETE removes message from channel', () => {
    const core = buildFakeCore(vi.fn());
    const nexus = core.messages.for('srv-1');
    nexus.insertMessage(completeBundle({ id: 'msg-del' }));

    routeRealtimeEvent(core as unknown as HavenCore, {
      type: 'MESSAGE_DELETE',
      payload: {
        community_id: 'srv-1',
        channel_id: 'ch-1',
        message_id: 'msg-del',
      },
    });

    expect(nexus.getSnapshot('msg-del')).toBeUndefined();
  });
});
