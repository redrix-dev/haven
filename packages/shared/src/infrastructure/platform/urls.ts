import { getAppHost } from "@shared/infrastructure/platform/appHost";

export const HAVEN_TERMS_URL = "https://projects.haven.redrixx.com/terms";
export const HAVEN_PRIVACY_URL = "https://projects.haven.redrixx.com/privacy";

export const openPlatformExternalUrl = async (url: string): Promise<void> => {
  await getAppHost().openExternalUrl(url);
};
