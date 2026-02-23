import { describe, beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { centralCommunityDataBackend } from '@/lib/backend/communityDataBackend';
import { centralNotificationBackend } from '@/lib/backend/notificationBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import {
  getFixtureChannelByName,
  getFixtureCommunityByName,
  signInAsTestUser,
  signOutTestUser,
} from '../../../../test/setup/supabaseLocal';

describe.sequential('CommunityDataBackend mention integration (contract)', () => {
  const users = loadBootstrappedTestUsers();
  let fixtureCommunityId = '';
  let fixtureGeneralChannelId = '';

  beforeAll(async () => {
    const community = await getFixtureCommunityByName();
    const channel = await getFixtureChannelByName({ communityId: community.id, name: 'general' });
    fixtureCommunityId = community.id;
    fixtureGeneralChannelId = channel.id;
    await signInAsTestUser('member_a');
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await signInAsTestUser('member_a');
  });

  it('message send path produces a channel_mention notification via DB trigger', async () => {
    await centralCommunityDataBackend.sendUserMessage({
      communityId: fixtureCommunityId,
      channelId: fixtureGeneralChannelId,
      userId: users.member_a.id,
      content: `@${users.member_b.username} backend mention integration`,
      replyToMessageId: undefined,
      mediaUpload: undefined,
    });

    await signInAsTestUser('member_b');
    const inbox = await centralNotificationBackend.listNotifications({ limit: 25 });
    const mention = inbox.find(
      (row) =>
        row.kind === 'channel_mention' &&
        row.payload.communityId === fixtureCommunityId &&
        row.payload.channelId === fixtureGeneralChannelId
    );
    expect(mention).toBeTruthy();
  });
});
