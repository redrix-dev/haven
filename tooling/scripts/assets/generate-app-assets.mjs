import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const appAssetsJsonPath = path.resolve(
  repoRoot,
  'packages/shared/src/config/appAssets.json'
);
const appAssets = JSON.parse(await fs.readFile(appAssetsJsonPath, 'utf8'));

const publicDir = path.resolve(repoRoot, 'apps/web/public');
const indexTemplatePath = path.resolve(repoRoot, 'apps/web/src/index.template.html');
const indexHtmlPath = path.resolve(repoRoot, 'apps/web/src/index.html');

const staleGeneratedDir = path.resolve(repoRoot, 'apps/web/src/generated');

const write = async (filePath, content) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

const normalizeAssetPublicPath = (assetPath) => {
  if (typeof assetPath !== 'string' || assetPath.trim().length === 0) {
    throw new Error(`Invalid web asset path: ${String(assetPath)}`);
  }

  const trimmed = assetPath.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const publicFilePathFromAssetPath = (assetPath) =>
  path.resolve(publicDir, normalizeAssetPublicPath(assetPath).replace(/^\//, ''));

const createVersionedAssetUrl = async (assetPath) => {
  const normalizedPath = normalizeAssetPublicPath(assetPath);
  const assetFilePath = publicFilePathFromAssetPath(normalizedPath);
  let contents;

  try {
    contents = await fs.readFile(assetFilePath);
  } catch (error) {
    throw new Error(
      `Missing configured web asset file: ${assetFilePath} (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const version = crypto
    .createHash('sha256')
    .update(contents)
    .digest('hex')
    .slice(0, 10);

  return `${normalizedPath}?v=${version}`;
};

const webAssetsEntries = await Promise.all(
  Object.entries({
    browserTabIcon: appAssets.web.browserTabIcon,
    highResolutionIcon: appAssets.web.highResolutionIcon ?? appAssets.web.browserTabIcon,
    appleTouchIcon: appAssets.web.appleTouchIcon ?? appAssets.web.browserTabIcon,
  }).map(async ([key, assetPath]) => [key, await createVersionedAssetUrl(assetPath)])
);
const webAssets = Object.fromEntries(webAssetsEntries);

const indexTemplate = await fs.readFile(indexTemplatePath, 'utf8');
if (!indexTemplate.includes('<!-- HAVEN_GENERATED_WEB_APP_HEAD -->')) {
  throw new Error(
    `Missing <!-- HAVEN_GENERATED_WEB_APP_HEAD --> marker in ${indexTemplatePath}`
  );
}

const generatedHeadMarkup = [
  '    <meta name="theme-color" content="#3f79d8" />',
  '    <meta name="application-name" content="Haven" />',
  `    <link rel="icon" type="image/png" sizes="192x192" href="${webAssets.browserTabIcon}" />`,
  `    <link rel="icon" type="image/png" sizes="512x512" href="${webAssets.highResolutionIcon}" />`,
  `    <link rel="shortcut icon" href="${webAssets.browserTabIcon}" />`,
  `    <link rel="apple-touch-icon" href="${webAssets.appleTouchIcon}" />`,
].join('\n');

await write(
  indexHtmlPath,
  indexTemplate.replace('    <!-- HAVEN_GENERATED_WEB_APP_HEAD -->', generatedHeadMarkup)
);

await fs.rm(staleGeneratedDir, { recursive: true, force: true });

console.log('Generated web asset head markup.');
