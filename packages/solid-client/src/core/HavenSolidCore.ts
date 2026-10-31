import {
  HavenCore,
  type HavenCoreOptions,
  type HavenPartsContext,
} from "@shared/core/havenCore";
import { playNotificationSound } from "@solid-client/audio/sounds";
import {
  ChannelSolidNexus,
  CommunityAdminSolidNexus,
  CommunityModerationSolidNexus,
  CommunitySolidNexus,
  DirectMessageSolidNexus,
  FeatureFlagSolidNexus,
  NotificationSolidNexus,
  OnboardingSolidNexus,
  PermissionsSolidNexus,
  ProfileSolidNexus,
  SocialSolidNexus,
  VoiceSolidNexus,
  createMessageSolidRegistry,
  createSolidAuthSessionStore,
  createSolidUiSessionStore,
  createSolidViewerMessagePolicyStore,
} from "@solid-client/data";

export type HavenSolidCoreOptions = HavenCoreOptions;

/** Desktop and web's binding of every shared nexus, plus their Solid session stores. */
function createSolidParts({
  backends,
  persistence,
  voiceRealtime,
}: HavenPartsContext) {
  const viewerMessagePolicyStore = createSolidViewerMessagePolicyStore();
  return {
    communities: new CommunitySolidNexus(persistence, backends.controlPlane),
    channels: new ChannelSolidNexus(persistence, backends.communityData),
    messages: createMessageSolidRegistry(persistence, viewerMessagePolicyStore),
    directMessages: new DirectMessageSolidNexus(
      persistence,
      backends.directMessages,
    ),
    notifications: new NotificationSolidNexus(
      persistence,
      backends.notifications,
    ),
    onboarding: new OnboardingSolidNexus(backends.controlPlane),
    social: new SocialSolidNexus(backends.social),
    permissions: new PermissionsSolidNexus(backends.communityData),
    featureFlags: new FeatureFlagSolidNexus(backends.controlPlane),
    profiles: new ProfileSolidNexus(backends.controlPlane),
    admin: new CommunityAdminSolidNexus(
      backends.communityData,
      backends.controlPlane,
    ),
    moderation: new CommunityModerationSolidNexus(backends.serverModmail),
    voice: new VoiceSolidNexus(backends.voiceToken, voiceRealtime, persistence),
    viewerMessagePolicyStore,
    authStore: createSolidAuthSessionStore(),
    uiStore: createSolidUiSessionStore(),
  };
}

/** The shared HavenCore with the Solid bindings, for desktop (Tauri) and web. */
export class HavenSolidCore extends HavenCore<
  ReturnType<typeof createSolidParts>
> {
  constructor(options: HavenSolidCoreOptions) {
    super(options, {
      createParts: createSolidParts,
      // On web, links on this deployment's own origin (a preview, local dev)
      // are app links too. Tauri's production origin isn't http(s).
      linkParse: {
        appOrigins:
          typeof window !== "undefined" &&
          /^https?:$/.test(window.location.protocol)
            ? [window.location.origin]
            : [],
      },
      onNotificationArrived: playNotificationSound,
    });
  }
}
