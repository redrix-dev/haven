import { requireHavenDataRuntime } from "@shared/runtime/havenRuntimeRegistry";
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

export const getControlPlaneBackend = (): ControlPlaneBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().controlPlane;
  }
};

export const getCommunityDataBackend = (_communityId: string): CommunityDataBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().communityData;
  }
};

export const getNotificationBackend = (): NotificationBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().notifications;
  }
};

export const getSocialBackend = (): SocialBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().social;
  }
};

export const getDirectMessageBackend = (): DirectMessageBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().directMessages;
  }
};

export const getModerationBackend = (): ModerationBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().moderation;
  }
};

export const getServerModmailBackend = (): ServerModmailBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return requireHavenDataRuntime().serverModmail;
  }
};
