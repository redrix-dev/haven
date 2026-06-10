import { getAppHost } from "@shared/infrastructure/platform/appHost";

const DESKTOP_AUTH_CONFIRM_REDIRECT_URL = "haven://auth/confirm";
const DESKTOP_INVITE_BASE_URL = "haven://invite/";
export const HAVEN_TERMS_URL = "https://projects.haven.redrixx.com/terms";
export const HAVEN_PRIVACY_URL = "https://projects.haven.redrixx.com/privacy";

const getBrowserOrigin = (): string | null => {
  return getAppHost().browserRuntime?.getLocationOrigin() ?? null;
};

export const getPlatformAuthConfirmRedirectUrl = (): string => {
  if (getAppHost().isDesktopApp()) return DESKTOP_AUTH_CONFIRM_REDIRECT_URL;

  const origin = getBrowserOrigin();
  if (!origin) return DESKTOP_AUTH_CONFIRM_REDIRECT_URL;

  return new URL("/auth/confirm", origin).toString();
};

export const getPlatformInviteBaseUrl = (): string => {
  if (getAppHost().isDesktopApp()) return DESKTOP_INVITE_BASE_URL;

  const origin = getBrowserOrigin();
  if (!origin) return DESKTOP_INVITE_BASE_URL;

  return new URL("/invite/", origin).toString();
};

export const getPlatformInviteInputPlaceholder = (): string =>
  `ABC12345 or ${getPlatformInviteBaseUrl()}ABC12345`;

export const openPlatformExternalUrl = async (url: string): Promise<void> => {
  await getAppHost().openExternalUrl(url);
};
