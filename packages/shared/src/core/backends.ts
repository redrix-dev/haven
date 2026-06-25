import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import {
  configureCommunityDataBackendRuntime,
  centralCommunityDataBackend,
} from "@shared/lib/backend/communityDataBackend";
import {
  createControlPlaneBackend,
  type ControlPlaneBackend,
} from "@shared/lib/backend/controlPlaneBackend";
import {
  createDirectMessageBackend,
  type DirectMessageBackend,
} from "@shared/lib/backend/directMessageBackend";
import { createMediaAttachmentHelpers } from "@shared/lib/backend/mediaAttachmentUtils";
import { createMessageObjectStore } from "@shared/lib/backend/messageObjectStore";
import {
  createModerationBackend,
  type ModerationBackend,
} from "@shared/lib/backend/moderationBackend";
import {
  createNotificationBackend,
  type NotificationBackend,
} from "@shared/lib/backend/notificationBackend";
import {
  createServerModmailBackend,
  type ServerModmailBackend,
} from "@shared/lib/backend/serverModmailBackend";
import {
  createVoiceTokenBackend,
  type VoiceTokenBackend,
} from "@shared/lib/backend/voiceTokenBackend";
import {
  createSocialBackend,
  type SocialBackend,
} from "@shared/lib/backend/socialBackend";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";

export type HavenSupabasePublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/**
 * Backend API clients composed once for HavenCore internals and Nexus wiring.
 * UI/feature consumers should not reach through `core.backends`; add a
 * HavenCore/Nexus command instead. Auth/bootstrap is the bounded exception
 * because it establishes the session Core depends on.
 */
export type HavenBackends = {
  client: HavenSupabaseClient;
  publicConfig: HavenSupabasePublicConfig;
  controlPlane: ControlPlaneBackend;
  communityData: CommunityDataBackend;
  directMessages: DirectMessageBackend;
  moderation: ModerationBackend;
  notifications: NotificationBackend;
  social: SocialBackend;
  serverModmail: ServerModmailBackend;
  voiceToken: VoiceTokenBackend;
};

/**
 * Composes every backend from a single Supabase client.
 * Called once during HavenCore construction.
 */
export function createHavenBackends(
  client: HavenSupabaseClient,
  publicConfig: HavenSupabasePublicConfig,
): HavenBackends {
  const messageStore = createMessageObjectStore(client);
  const media = createMediaAttachmentHelpers(messageStore);

  configureCommunityDataBackendRuntime({
    client,
    edge: publicConfig,
    media,
    messageStore,
  });

  const controlPlane = createControlPlaneBackend(client);
  const communityData = centralCommunityDataBackend;
  const directMessages = createDirectMessageBackend(client, media);
  const moderation = createModerationBackend(client, media);
  const notifications = createNotificationBackend(client);
  const social = createSocialBackend(client);
  const serverModmail = createServerModmailBackend(client, communityData);
  const voiceToken = createVoiceTokenBackend(client);

  return {
    client,
    publicConfig,
    controlPlane,
    communityData,
    directMessages,
    moderation,
    notifications,
    social,
    serverModmail,
    voiceToken,
  };
}
