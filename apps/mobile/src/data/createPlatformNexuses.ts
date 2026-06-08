import type {
  CreatePlatformNexusBundle,
  PlatformNexusBundle,
  PlatformNexusContext,
} from "@shared/core/cache/platformNexusPorts";
import type { ViewerMessagePolicyStore as ReactViewerMessagePolicyStore } from "./session/viewerMessagePolicyStore";
import { CommunityAdminNexus } from "./community/CommunityAdminNexus";
import { CommunityModerationNexus } from "./community/CommunityModerationNexus";
import { FeatureFlagNexus } from "./feature-flags/FeatureFlagNexus";
import { OnboardingNexus } from "./onboarding/OnboardingNexus";
import { PermissionsNexus } from "./permissions/PermissionsNexus";
import { ProfileNexus } from "./profile/ProfileNexus";
import { SocialNexus } from "./social/SocialNexus";
import { VoiceNexus } from "./voice/VoiceNexus";

export function createPlatformNexusBundle(
  ctx: PlatformNexusContext,
): PlatformNexusBundle {
  const { persistence, backends, viewerMessagePolicyStore, voiceRealtime } = ctx;

  return {
    admin: new CommunityAdminNexus(persistence, backends.controlPlane),
    moderation: new CommunityModerationNexus(persistence, backends.serverModmail),
    social: new SocialNexus(persistence, backends.social),
    permissions: new PermissionsNexus(persistence),
    profiles: new ProfileNexus(persistence, backends.controlPlane),
    featureFlags: new FeatureFlagNexus(persistence, backends.controlPlane),
    onboarding: new OnboardingNexus(persistence, backends.controlPlane),
    voice: new VoiceNexus(
      persistence,
      viewerMessagePolicyStore as ReactViewerMessagePolicyStore,
      backends.voiceToken,
      voiceRealtime,
    ),
  };
}

export const createReactPlatformNexusBundle: CreatePlatformNexusBundle =
  createPlatformNexusBundle;
