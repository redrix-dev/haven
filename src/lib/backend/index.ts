import { centralCommunityDataBackend, type CommunityDataBackend } from './communityDataBackend';
import { centralControlPlaneBackend, type ControlPlaneBackend } from './controlPlaneBackend';
import { centralDirectMessageBackend, type DirectMessageBackend } from './directMessageBackend';
import { centralModerationBackend, type ModerationBackend } from './moderationBackend';
import { centralNotificationBackend, type NotificationBackend } from './notificationBackend';
import { centralSocialBackend, type SocialBackend } from './socialBackend';

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
      return centralControlPlaneBackend;
  }
};

export const getCommunityDataBackend = (_communityId: string): CommunityDataBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return centralCommunityDataBackend;
  }
};

export const getNotificationBackend = (): NotificationBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return centralNotificationBackend;
  }
};

export const getSocialBackend = (): SocialBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return centralSocialBackend;
  }
};

export const getDirectMessageBackend = (): DirectMessageBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return centralDirectMessageBackend;
  }
};

export const getModerationBackend = (): ModerationBackend => {
  switch (backendMode) {
    case 'central_supabase':
    default:
      return centralModerationBackend;
  }
};
