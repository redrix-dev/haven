import { APP_ASSETS } from '../generated/appAssets.generated';

export const assertWebAppAssets = () => {
  if (!APP_ASSETS.web.manifestIcons.length) {
    throw new Error('No manifest icons configured.');
  }
  return APP_ASSETS;
};
