import { requireSessionBackends } from "./sessionBackendRegistry";
import type { CommunityDataBackend } from "./communityDataBackend.interface";
import type { ControlPlaneBackend } from "./controlPlaneBackend";
import type { DirectMessageBackend } from "./directMessageBackend";
import type { ModerationBackend } from "./moderationBackend";
import type { NotificationBackend } from "./notificationBackend";
import type { ServerModmailBackend } from "./serverModmailBackend";
import type { SocialBackend } from "./socialBackend";

export type BackendMode = "central_supabase";

const DEFAULT_BACKEND_MODE: BackendMode = "central_supabase";

const parseBackendMode = (value: string | undefined): BackendMode => {
  if (value === "central_supabase") {
    return value;
  }
  return DEFAULT_BACKEND_MODE;
};

const resolveBackendModeFromEnv = (): string | undefined => {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env?.HAVEN_BACKEND_MODE;
};

const backendMode = parseBackendMode(resolveBackendModeFromEnv());

export const getBackendMode = (): BackendMode => backendMode;

export const getControlPlaneBackend = (): ControlPlaneBackend =>
  requireSessionBackends().controlPlane;

export const getCommunityDataBackend = (
  _communityId: string,
): CommunityDataBackend => requireSessionBackends().communityData;

export const getNotificationBackend = (): NotificationBackend =>
  requireSessionBackends().notifications;

export const getSocialBackend = (): SocialBackend =>
  requireSessionBackends().social;

export const getDirectMessageBackend = (): DirectMessageBackend =>
  requireSessionBackends().directMessages;

export const getModerationBackend = (): ModerationBackend =>
  requireSessionBackends().moderation;

export const getServerModmailBackend = (): ServerModmailBackend =>
  requireSessionBackends().serverModmail;

export {
  registerSessionBackends,
  resetSessionBackends,
  requireSessionBackends,
} from "./sessionBackendRegistry";
