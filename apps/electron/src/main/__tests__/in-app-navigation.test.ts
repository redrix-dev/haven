import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('isInAppNavigation', () => {
  it('treats same http(s) origin as in-app (fixes HMR reload opening OS browser)', async () => {
    const { isInAppNavigation } = await import('../lib/inAppNavigation.js');
    const base = 'http://127.0.0.1:3000/main_window/index.html';
    expect(isInAppNavigation(base, 'http://127.0.0.1:3000/main_window/')).toBe(
      true,
    );
    expect(
      isInAppNavigation(base, 'http://127.0.0.1:3000/other/chunk.js'),
    ).toBe(true);
    expect(isInAppNavigation(base, 'https://example.com/')).toBe(false);
  });

  it('treats file: paths under the renderer directory as in-app', async () => {
    const { isInAppNavigation } = await import('../lib/inAppNavigation.js');
    const root = mkdtempSync(path.join(tmpdir(), 'haven-inapp-'));
    const dir = path.join(root, 'bundle');
    mkdirSync(dir, { recursive: true });
    const indexPath = path.join(dir, 'index.html');
    writeFileSync(indexPath, '');
    const base = pathToFileURL(indexPath).href;
    const sibling = pathToFileURL(path.join(dir, 'other.html')).href;
    const outside = pathToFileURL(path.join(root, 'outside.html')).href;
    expect(isInAppNavigation(base, sibling)).toBe(true);
    expect(isInAppNavigation(base, outside)).toBe(false);
  });
});
