import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rendererEntryServiceModule = require('../renderer-entry-service.js');
const { createRendererEntryService, _private } = rendererEntryServiceModule;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not resolve free port.'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function httpRequest(options: http.RequestOptions & { body?: string | Buffer }) {
  return new Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('renderer-entry-service', () => {
  const startedServices: Array<{ stop: () => Promise<void> }> = [];

  afterEach(async () => {
    while (startedServices.length > 0) {
      const service = startedServices.pop();
      if (!service) continue;
      await service.stop();
    }
  });

  it('parses proxy and static webpack entry URLs', async () => {
    const proxyRoute = _private.parseWebpackEntry({
      entryName: 'main_window',
      webpackEntryUrl: 'http://localhost:3000/main_window',
    });
    expect(proxyRoute.mode).toBe('proxy');
    expect(proxyRoute.localPathPrefix).toBe('/main_window/');
    expect(proxyRoute.upstream.origin).toBe('http://localhost:3000');
    expect(proxyRoute.upstream.entryPathname).toBe('/main_window');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haven-renderer-entry-'));
    const indexFilePath = path.join(tmpDir, 'index.html');
    await fs.writeFile(indexFilePath, '<!doctype html><title>Test</title>', 'utf8');

    const staticRoute = _private.parseWebpackEntry({
      entryName: 'main_window',
      webpackEntryUrl: pathToFileURL(indexFilePath).toString(),
    });
    expect(staticRoute.mode).toBe('static');
    expect(staticRoute.indexFilePath).toBe(indexFilePath);
    expect(staticRoute.staticRootDir).toBe(tmpDir);
  });

  it('generates canonical entry URL and recognizes renderer document URLs', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haven-renderer-entry-'));
    const indexFilePath = path.join(tmpDir, 'index.html');
    await fs.writeFile(indexFilePath, '<!doctype html><title>Test</title>', 'utf8');

    const port = await getFreePort();
    const service = createRendererEntryService({
      port,
      waitForDevServer: false,
      entries: [
        {
          entryName: 'main_window',
          webpackEntryUrl: pathToFileURL(indexFilePath).toString(),
        },
      ],
    });
    startedServices.push(service);
    await service.start();

    expect(service.getCanonicalOrigin()).toBe(`http://127.0.0.1:${port}`);
    expect(service.getEntryUrl('main_window')).toBe(`http://127.0.0.1:${port}/main_window/`);
    expect(service.isRendererDocumentUrl(`http://127.0.0.1:${port}/main_window/`)).toBe(true);
    expect(service.isRendererDocumentUrl('file:///tmp/index.html')).toBe(false);
    expect(service.isRendererDocumentUrl(`http://127.0.0.1:${port}/other/`)).toBe(false);
  });

  it('serves packaged static files and blocks invalid methods / hosts / traversal', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haven-renderer-static-'));
    const indexFilePath = path.join(tmpDir, 'index.html');
    const assetDir = path.join(tmpDir, 'assets');
    await fs.mkdir(assetDir, { recursive: true });
    await fs.writeFile(indexFilePath, '<!doctype html><body>renderer</body>', 'utf8');
    await fs.writeFile(path.join(assetDir, 'app.js'), 'console.log("ok");', 'utf8');

    const port = await getFreePort();
    const service = createRendererEntryService({
      port,
      waitForDevServer: false,
      entries: [
        {
          entryName: 'main_window',
          webpackEntryUrl: pathToFileURL(indexFilePath).toString(),
        },
      ],
    });
    startedServices.push(service);
    await service.start();

    const indexResponse = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/main_window/',
      method: 'GET',
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.body).toContain('renderer');
    expect(indexResponse.headers['cache-control']).toBe('no-store');
    expect(indexResponse.headers['referrer-policy']).toBe('origin');

    const assetHead = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/main_window/assets/app.js',
      method: 'HEAD',
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(assetHead.statusCode).toBe(200);
    expect(assetHead.body).toBe('');
    expect(assetHead.headers['content-type']).toContain('application/javascript');

    const invalidHost = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/main_window/',
      method: 'GET',
      headers: { Host: 'evil.example' },
    });
    expect(invalidHost.statusCode).toBe(400);

    const invalidMethod = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/main_window/',
      method: 'POST',
      headers: { Host: `127.0.0.1:${port}` },
      body: 'x',
    });
    expect(invalidMethod.statusCode).toBe(405);

    const traversal = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/main_window/%2e%2e/%2e%2e/Windows/win.ini',
      method: 'GET',
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect([400, 404]).toContain(traversal.statusCode);
  });

  it('fails fast on port conflict', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haven-renderer-port-'));
    const indexFilePath = path.join(tmpDir, 'index.html');
    await fs.writeFile(indexFilePath, '<!doctype html>', 'utf8');
    const entryUrl = pathToFileURL(indexFilePath).toString();
    const port = await getFreePort();

    const serviceA = createRendererEntryService({
      port,
      waitForDevServer: false,
      entries: [{ entryName: 'main_window', webpackEntryUrl: entryUrl }],
    });
    startedServices.push(serviceA);
    await serviceA.start();

    const serviceB = createRendererEntryService({
      port,
      waitForDevServer: false,
      entries: [{ entryName: 'main_window', webpackEntryUrl: entryUrl }],
    });

    await expect(serviceB.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('rewrites proxy paths under the registered local prefix', () => {
    const route = _private.parseWebpackEntry({
      entryName: 'main_window',
      webpackEntryUrl: 'http://localhost:3000/main_window',
    });

    expect(_private.getProxyUpstreamPath(route, '/main_window/', '')).toBe('/main_window');
    expect(_private.getProxyUpstreamPath(route, '/main_window/assets/app.js', '?v=1')).toBe(
      '/main_window/assets/app.js?v=1'
    );
    expect(_private.getProxyUpstreamPath(route, '/other/', '')).toBeNull();
  });
});

