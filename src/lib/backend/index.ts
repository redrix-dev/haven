import { centralCommunityDataBackend, type CommunityDataBackend } from './communityDataBackend';
import { centralControlPlaneBackend, type ControlPlaneBackend } from './controlPlaneBackend';

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
