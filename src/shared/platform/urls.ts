import { desktopClient } from '@/shared/desktop/client';

const DESKTOP_AUTH_CONFIRM_REDIRECT_URL = 'haven://auth/confirm';
const DESKTOP_INVITE_BASE_URL = 'haven://invite/';

const getBrowserOrigin = (): string | null => {
  if (typeof window === 'undefined') return null;

  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !origin || origin === 'null') {
    return null;
  }

  return origin;
};

export const getPlatformAuthConfirmRedirectUrl = (): string => {
  if (desktopClient.isAvailable()) return DESKTOP_AUTH_CONFIRM_REDIRECT_URL;

  const origin = getBrowserOrigin();
  if (!origin) return DESKTOP_AUTH_CONFIRM_REDIRECT_URL;

  return new URL('/auth/confirm', origin).toString();
};

export const getPlatformInviteBaseUrl = (): string => {
  if (desktopClient.isAvailable()) return DESKTOP_INVITE_BASE_URL;

  const origin = getBrowserOrigin();
  if (!origin) return DESKTOP_INVITE_BASE_URL;

  return new URL('/invite/', origin).toString();
};

export const getPlatformInviteInputPlaceholder = (): string =>
  `ABC12345 or ${getPlatformInviteBaseUrl()}ABC12345`;

