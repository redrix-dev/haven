import type { HavenSupabaseClient } from "@shared/infrastructure/client/createHavenSupabaseClient";
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
  createSocialBackend,
  type SocialBackend,
} from "@shared/lib/backend/socialBackend";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";

export type HavenSupabasePublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/**
 * All backend API clients exposed by HavenCore.backends.
 * Consumers should normally read these via `requireHavenCore().backends.*`,
 * not by importing factories directly.
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
  };
}
