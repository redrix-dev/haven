import { requireHavenCore } from "@shared/core/havenCoreRef";
import type { CommunityDataBackend } from './communityDataBackend.interface';
import type { ControlPlaneBackend } from './controlPlaneBackend';
import type { DirectMessageBackend } from './directMessageBackend';
import type { ModerationBackend } from './moderationBackend';
import type { NotificationBackend } from './notificationBackend';
import type { ServerModmailBackend } from './serverModmailBackend';
import type { SocialBackend } from './socialBackend';

export type BackendMode = 'central_supabase';

const DEFAULT_BACKEND_MODE: BackendMode = 'central_supabase';

const parseBackendMode = (value: string | undefined): BackendMode => {
  if (value === 'central_supabase') {
    return value;
  }
  return DEFAULT_BACKEND_MODE;
};

const resolveBackendModeFromEnv = (): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }
  return process.env?.HAVEN_BACKEND_MODE;
};

const backendMode = parseBackendMode(resolveBackendModeFromEnv());

export const getBackendMode = (): BackendMode => backendMode;

export const getControlPlaneBackend = (): ControlPlaneBackend =>
  requireHavenCore().backends.controlPlane;

export const getCommunityDataBackend = (_communityId: string): CommunityDataBackend =>
  requireHavenCore().backends.communityData;

export const getNotificationBackend = (): NotificationBackend =>
  requireHavenCore().backends.notifications;

export const getSocialBackend = (): SocialBackend =>
  requireHavenCore().backends.social;

export const getDirectMessageBackend = (): DirectMessageBackend =>
  requireHavenCore().backends.directMessages;

export const getModerationBackend = (): ModerationBackend =>
  requireHavenCore().backends.moderation;

export const getServerModmailBackend = (): ServerModmailBackend =>
  requireHavenCore().backends.serverModmail;
