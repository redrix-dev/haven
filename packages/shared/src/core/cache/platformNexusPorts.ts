import type { HavenBackends } from "@shared/core/backends";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type {
  VoiceRealtimeChannel,
  VoiceRealtimeTransport,
} from "@shared/features/voice/types";

export type { VoiceRealtimeChannel, VoiceRealtimeTransport };

export type PlatformNexusContext = {
  persistence: NexusPersistence;
  backends: HavenBackends;
  viewerMessagePolicyStore: ViewerMessagePolicyStore;
  voiceRealtime: VoiceRealtimeTransport;
};

export type PlatformNexusBundle = {
  admin: import("@mobile-data/community/CommunityAdminNexus").CommunityAdminNexus;
  moderation: import("@mobile-data/community/CommunityModerationNexus").CommunityModerationNexus;
  social: import("@mobile-data/social/SocialNexus").SocialNexus;
  permissions: import("@mobile-data/permissions/PermissionsNexus").PermissionsNexus;
  profiles: import("@mobile-data/profile/ProfileNexus").ProfileNexus;
  featureFlags: import("@mobile-data/feature-flags/FeatureFlagNexus").FeatureFlagNexus;
  onboarding: import("@mobile-data/onboarding/OnboardingNexus").OnboardingNexus;
  voice: import("@mobile-data/voice/VoiceNexus").VoiceNexus;
};

export type CreatePlatformNexusBundle = (
  ctx: PlatformNexusContext,
) => PlatformNexusBundle;
