import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourcePath = path.resolve('packages/shared/src/config/appAssets.json');
const sourceContent = await readFile(sourcePath, 'utf8');
const appAssets = JSON.parse(sourceContent);

const outJson = path.resolve('apps/web-mobile/public/app-assets.generated.json');
const outJs = path.resolve('apps/web-mobile/public/app-assets.generated.js');
const outTs = path.resolve('apps/web-mobile/src/generated/appAssets.generated.ts');

await mkdir(path.dirname(outJson), { recursive: true });
await mkdir(path.dirname(outTs), { recursive: true });
await writeFile(outJson, `${JSON.stringify(appAssets, null, 2)}\n`);
await writeFile(outJs, `window.__HAVEN_APP_ASSETS__ = ${JSON.stringify(appAssets, null, 2)};\n`);
await writeFile(outTs, `export const APP_ASSETS = ${JSON.stringify(appAssets, null, 2)} as const;\n`);
console.log('Generated app assets files.');
