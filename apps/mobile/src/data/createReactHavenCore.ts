import {
  createHavenCore as createSharedHavenCore,
  type HavenCore,
  type HavenCoreOptions,
} from "@shared/core";
import { registerSessionStores } from "@shared/core/sessionStoreRegistry";
import {
  createCommunityMessageRegistry,
} from "./messages/registry";
import { createReactPlatformNexusBundle } from "./createPlatformNexuses";
import { createCommunityNexus } from "./communities/factory";
import { createChannelNexus } from "./channels/factory";
import { createDirectMessageNexus } from "./direct-messages/factory";
import { createNotificationNexus } from "./notifications/factory";
import {
  createMobileViewerMessagePolicyStore,
  useAuthStore,
  useUiStore,
  useUserStatusStore,
} from "./session";

export type ReactHavenCoreOptions = Omit<
  HavenCoreOptions,
  | "createMessageRegistry"
  | "createCommunityNexus"
  | "createChannelNexus"
  | "createDirectMessageNexus"
  | "createNotificationNexus"
  | "createPlatformNexusBundle"
  | "viewerMessagePolicyStore"
  | "authStore"
  | "uiStore"
  | "userStatusStore"
>;

/** Bootstrap HavenCore with the React-platform message cache (mobile, web, electron). */
export function createReactHavenCore(options: ReactHavenCoreOptions): HavenCore {
  registerSessionStores({
    authStore: useAuthStore,
    uiStore: useUiStore,
    userStatusStore: useUserStatusStore,
  });
  const viewerMessagePolicyStore = createMobileViewerMessagePolicyStore();
  return createSharedHavenCore({
    ...options,
    authStore: useAuthStore,
    uiStore: useUiStore,
    userStatusStore: useUserStatusStore,
    viewerMessagePolicyStore,
    createMessageRegistry: createCommunityMessageRegistry,
    createCommunityNexus,
    createChannelNexus,
    createDirectMessageNexus,
    createNotificationNexus,
    createPlatformNexusBundle: createReactPlatformNexusBundle,
  });
}

/** @deprecated Use createReactHavenCore */
export const createMobileHavenCore = createReactHavenCore;

export function createReactHavenCoreOptions(
  base: ReactHavenCoreOptions,
): HavenCoreOptions {
  registerSessionStores({
    authStore: useAuthStore,
    uiStore: useUiStore,
    userStatusStore: useUserStatusStore,
  });
  const viewerMessagePolicyStore = createMobileViewerMessagePolicyStore();
  return {
    ...base,
    authStore: useAuthStore,
    uiStore: useUiStore,
    userStatusStore: useUserStatusStore,
    viewerMessagePolicyStore,
    createMessageRegistry: createCommunityMessageRegistry,
    createCommunityNexus,
    createChannelNexus,
    createDirectMessageNexus,
    createNotificationNexus,
    createPlatformNexusBundle: createReactPlatformNexusBundle,
  };
}
