import { getPlatformRuntime } from '@platform/runtime/PlatformRuntimeContext';

export const getPlatformAuthConfirmRedirectUrl = (): string => {
  return getPlatformRuntime().links.getAuthConfirmRedirectUrl();
};

export const getPlatformInviteBaseUrl = (): string => {
  return getPlatformRuntime().links.getInviteBaseUrl();
};

export const getPlatformInviteInputPlaceholder = (): string =>
  `ABC12345 or ${getPlatformInviteBaseUrl()}ABC12345`;

