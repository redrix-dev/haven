import {
  HavenCore,
  type HavenCoreOptions,
  type HavenPartsContext,
} from "@shared/core/havenCore";
import type { UserStatusStorePort } from "@shared/core/sessionStorePorts";
import { ChannelReactNexus } from "../channels/channelReactNexus";
import { CommunityReactNexus } from "../communities/communityReactNexus";
import { CommunityAdminReactNexus } from "../community-management/communityAdminReactNexus";
import { CommunityModerationReactNexus } from "../community-management/communityModerationReactNexus";
import { DirectMessageReactNexus } from "../direct-messages/directMessageReactNexus";
import { FeatureFlagReactNexus } from "../feature-flags/featureFlagReactNexus";
import { createCommunityMessageRegistry } from "../messages/registry";
import { NotificationReactNexus } from "../notifications/notificationReactNexus";
import { OnboardingReactNexus } from "../onboarding/onboardingReactNexus";
import { PermissionsReactNexus } from "../permissions/permissionsReactNexus";
import { ProfileReactNexus } from "../profile/profileReactNexus";
import {
  createMobileViewerMessagePolicyStore,
  useAuthStore,
  useUiStore,
  useUserStatusStore,
} from "../session";
import { SocialReactNexus } from "../social/socialReactNexus";
import { VoiceReactNexus } from "../voice/voiceReactNexus";

export type HavenReactCoreOptions = HavenCoreOptions;

/** Mobile's binding of every shared nexus, plus its zustand session stores. */
function createReactParts({
  backends,
  persistence,
  voiceRealtime,
}: HavenPartsContext) {
  const viewerMessagePolicyStore = createMobileViewerMessagePolicyStore();
  return {
    communities: new CommunityReactNexus(persistence, backends.controlPlane),
    channels: new ChannelReactNexus(persistence, backends.communityData),
    messages: createCommunityMessageRegistry(
      persistence,
      viewerMessagePolicyStore,
    ),
    directMessages: new DirectMessageReactNexus(
      persistence,
      backends.directMessages,
    ),
    notifications: new NotificationReactNexus(
      persistence,
      backends.notifications,
    ),
    onboarding: new OnboardingReactNexus(backends.controlPlane),
    social: new SocialReactNexus(backends.social),
    permissions: new PermissionsReactNexus(backends.communityData),
    featureFlags: new FeatureFlagReactNexus(backends.controlPlane),
    profiles: new ProfileReactNexus(backends.controlPlane),
    admin: new CommunityAdminReactNexus(
      backends.communityData,
      backends.controlPlane,
    ),
    moderation: new CommunityModerationReactNexus(backends.serverModmail),
    voice: new VoiceReactNexus(backends.voiceToken, voiceRealtime, persistence),
    viewerMessagePolicyStore,
    authStore: useAuthStore,
    uiStore: useUiStore,
  };
}

/** The shared HavenCore with mobile's React bindings. */
export class HavenReactCore extends HavenCore<
  ReturnType<typeof createReactParts>
> {
  readonly userStatusStore: UserStatusStorePort = useUserStatusStore;

  constructor(options: HavenReactCoreOptions) {
    super(options, { createParts: createReactParts });
  }
}
