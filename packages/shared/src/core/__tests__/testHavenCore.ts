import { createStore } from "zustand/vanilla";
import { createMemoryPersistence } from "@shared/core/persistence/createMemoryPersistence";
import { HavenCore, type HavenPartsContext } from "@shared/core/havenCore";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyState,
} from "@shared/core/viewerMessagePolicy";
import type { UiStoreState } from "@shared/core/sessionStorePorts";
import {
  ChannelNexus,
  createInitialChannelState,
} from "@shared/nexus/channels/channelNexus";
import {
  CommunityNexus,
  createInitialCommunityState,
} from "@shared/nexus/communities/communityNexus";
import {
  CommunityAdminNexus,
  createInitialCommunityAdminState,
} from "@shared/nexus/community-management/communityAdminNexus";
import {
  CommunityModerationNexus,
  createInitialCommunityModerationState,
} from "@shared/nexus/community-management/communityModerationNexus";
import {
  DirectMessageNexus,
  createInitialDirectMessageState,
} from "@shared/nexus/direct-messages/directMessageNexus";
import {
  FeatureFlagNexus,
  createInitialFeatureFlagState,
} from "@shared/nexus/feature-flags/featureFlagNexus";
import { createPlainStatePort } from "@shared/nexus/kit/statePort";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
} from "@shared/nexus/messages/communityMessageNexus";
import { CommunityMessageRegistry } from "@shared/nexus/messages/communityMessageRegistry";
import {
  NotificationNexus,
  createInitialNotificationState,
} from "@shared/nexus/notifications/notificationNexus";
import {
  OnboardingNexus,
  createInitialOnboardingState,
} from "@shared/nexus/onboarding/onboardingNexus";
import {
  PermissionsNexus,
  createInitialPermissionsState,
} from "@shared/nexus/permissions/permissionsNexus";
import {
  ProfileNexus,
  createInitialProfileState,
} from "@shared/nexus/profile/profileNexus";
import {
  SocialNexus,
  createInitialSocialState,
} from "@shared/nexus/social/socialNexus";
import {
  VoiceNexus,
  createInitialVoiceState,
} from "@shared/nexus/voice/voiceNexus";

/** Backend calls a test can replace; anything else a test reaches throws. */
export type TestBackendOverrides = {
  controlPlane?: Record<string, unknown>;
  communityData?: Record<string, unknown>;
};

/**
 * A real HavenCore over the real shared nexuses, each on a plain state port,
 * with in-memory persistence and stub backends. For testing core wiring and
 * cross-nexus commands without a platform or a network.
 */
export function createTestHavenCore(overrides: TestBackendOverrides = {}) {
  const persistence = createMemoryPersistence();
  const client = {
    channel: () => ({}),
    removeChannel: async () => "ok",
    getChannels: () => [],
  } as never;

  const createParts = ({ backends }: HavenPartsContext) => {
    const controlPlane = {
      ...backends.controlPlane,
      ...overrides.controlPlane,
    };
    const communityData = {
      ...backends.communityData,
      ...overrides.communityData,
    };
    const viewerMessagePolicyStore = createStore<ViewerMessagePolicyState>(() =>
      createDefaultViewerMessagePolicyState(),
    );
    const uiState = { showHiddenMessages: false, reset: () => {} };
    return {
      communities: new CommunityNexus(
        createPlainStatePort(createInitialCommunityState()),
        persistence,
        controlPlane as never,
      ),
      channels: new ChannelNexus(
        createPlainStatePort(createInitialChannelState()),
        persistence,
        communityData as never,
      ),
      messages: new CommunityMessageRegistry(
        (communityId) =>
          new CommunityMessageNexus(
            communityId,
            createPlainStatePort(createInitialCommunityMessageState()),
            persistence,
            viewerMessagePolicyStore,
          ),
      ),
      directMessages: new DirectMessageNexus(
        createPlainStatePort(createInitialDirectMessageState()),
        persistence,
        backends.directMessages,
      ),
      notifications: new NotificationNexus(
        createPlainStatePort(createInitialNotificationState()),
        persistence,
        backends.notifications,
      ),
      onboarding: new OnboardingNexus(
        createPlainStatePort(createInitialOnboardingState()),
        controlPlane as never,
      ),
      social: new SocialNexus(
        createPlainStatePort(createInitialSocialState()),
        backends.social,
      ),
      permissions: new PermissionsNexus(
        createPlainStatePort(createInitialPermissionsState()),
        communityData as never,
      ),
      featureFlags: new FeatureFlagNexus(
        createPlainStatePort(createInitialFeatureFlagState()),
        controlPlane as never,
      ),
      profiles: new ProfileNexus(
        createPlainStatePort(createInitialProfileState()),
        controlPlane as never,
      ),
      admin: new CommunityAdminNexus(
        createPlainStatePort(createInitialCommunityAdminState()),
        communityData as never,
        controlPlane as never,
      ),
      moderation: new CommunityModerationNexus(
        createPlainStatePort(createInitialCommunityModerationState()),
        backends.serverModmail,
      ),
      voice: new VoiceNexus(
        createPlainStatePort(createInitialVoiceState()),
        null,
        null,
      ),
      viewerMessagePolicyStore,
      authStore: null,
      uiStore: { getState: () => uiState as unknown as UiStoreState },
    };
  };

  const core = new HavenCore(
    {
      client,
      publicConfig: {
        supabaseUrl: "http://test.invalid",
        supabaseAnonKey: "test",
      },
      persistence,
    },
    { createParts },
  );
  return { core, persistence };
}

/** Let fire-and-forget work (realtime handlers) settle. */
export async function flushAsync(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
