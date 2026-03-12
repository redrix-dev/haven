const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const httpProxy = require('http-proxy');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 43117;
const DEFAULT_ENTRY_NAME = 'main_window';
const DEV_PROXY_AUX_PATH_PREFIXES = ['/ws', '/sockjs-node', '/webpack-dev-server'];

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.otf', 'font/otf'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
]);

function ensureTrailingSlash(value) {
  if (!value) return '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeLocalPathPrefix(entryName) {
  const safeEntryName = String(entryName || DEFAULT_ENTRY_NAME)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
  const normalized = safeEntryName.length > 0 ? safeEntryName : DEFAULT_ENTRY_NAME;
  return `/${normalized}/`;
}

function getUrlOrigin(urlString) {
  const parsed = new URL(urlString);
  return `${parsed.protocol}//${parsed.host}`;
}

function getDirectoryLikeWebPath(pathname) {
  if (!pathname || pathname === '/') return '/';
  if (pathname.endsWith('/')) return pathname;
  if (path.posix.basename(pathname).includes('.')) {
    return `${path.posix.dirname(pathname)}/`.replace(/\/{2,}/g, '/');
  }
  return `${pathname}/`;
}

function parseWebpackEntry({ entryName, webpackEntryUrl }) {
  if (!entryName || !webpackEntryUrl) {
    throw new Error('Renderer entry requires entryName and webpackEntryUrl.');
  }

  const localPathPrefix = normalizeLocalPathPrefix(entryName);
  const parsed = new URL(webpackEntryUrl);

  if (parsed.protocol === 'file:') {
    const indexFilePath = fileURLToPath(parsed);
    return {
      entryName,
      webpackEntryUrl,
      localPathPrefix,
      mode: 'static',
      indexFilePath,
      staticRootDir: path.dirname(indexFilePath),
    };
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return {
      entryName,
      webpackEntryUrl,
      localPathPrefix,
      mode: 'proxy',
      upstream: {
        origin: getUrlOrigin(webpackEntryUrl),
        entryPathname: parsed.pathname || '/',
        entrySearch: parsed.search || '',
        assetsBasePathname: getDirectoryLikeWebPath(parsed.pathname || '/'),
      },
    };
  }

  throw new Error(
    `Unsupported renderer entry protocol for "${entryName}": ${parsed.protocol} (${webpackEntryUrl})`
  );
}

function isHashedAssetName(fileName) {
  return /\.[a-f0-9]{8,}\./i.test(fileName);
}

function getCacheControlForFile(filePath) {
  const baseName = path.basename(filePath);
  if (baseName === 'index.html') return 'no-store';
  if (isHashedAssetName(baseName)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

function getContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function safeDecodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function buildAllowedHostHeaders({ host, port }) {
  return new Set([
    `${host}:${port}`,
    host,
    `localhost:${port}`,
    'localhost',
  ]);
}

function isAllowedHostHeader(hostHeader, allowedHostHeaders) {
  if (typeof hostHeader !== 'string' || hostHeader.trim().length === 0) {
    return false;
  }
  return allowedHostHeaders.has(hostHeader.trim().toLowerCase());
}

function parseRequestUrl(reqUrl, canonicalOrigin) {
  try {
    return new URL(reqUrl || '/', canonicalOrigin);
  } catch {
    return null;
  }
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function findRouteForPath(routes, pathname) {
  for (const route of routes) {
    const exactPrefix = stripTrailingSlash(route.localPathPrefix);
    if (pathname === route.localPathPrefix || pathname === exactPrefix) return route;
    if (pathname.startsWith(route.localPathPrefix)) return route;
  }
  return null;
}

function isAllowedDevProxyAuxPath(pathname) {
  return DEV_PROXY_AUX_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getProxyUpstreamPath(route, pathname, search) {
  const exactPrefix = stripTrailingSlash(route.localPathPrefix);
  const isIndexRequest = pathname === route.localPathPrefix || pathname === exactPrefix;
  if (isIndexRequest) {
    return `${route.upstream.entryPathname}${search || route.upstream.entrySearch || ''}`;
  }

  if (!pathname.startsWith(route.localPathPrefix)) return null;
  const suffix = pathname.slice(route.localPathPrefix.length);
  const mappedPathname = path.posix.join(route.upstream.assetsBasePathname, suffix);
  return `${mappedPathname}${search || ''}`;
}

function getStaticTarget(route, pathname) {
  const exactPrefix = stripTrailingSlash(route.localPathPrefix);
  const isIndexRequest = pathname === route.localPathPrefix || pathname === exactPrefix;
  if (isIndexRequest) {
    return {
      filePath: route.indexFilePath,
      isIndex: true,
    };
  }

  if (!pathname.startsWith(route.localPathPrefix)) return null;

  const rawSuffix = pathname.slice(route.localPathPrefix.length);
  const decodedSuffix = safeDecodePathSegment(rawSuffix);
  if (decodedSuffix === null) return { error: 400 };
  if (decodedSuffix.length === 0) {
    return {
      filePath: route.indexFilePath,
      isIndex: true,
    };
  }
  if (decodedSuffix.includes('\0')) return { error: 400 };

  const normalizedRelative = decodedSuffix.replace(/^\/+/, '');
  const resolvedPath = path.resolve(route.staticRootDir, normalizedRelative);
  const rootWithSep = `${route.staticRootDir}${path.sep}`;
  if (resolvedPath !== route.staticRootDir && !resolvedPath.startsWith(rootWithSep)) {
    return { error: 400 };
  }

  return {
    filePath: resolvedPath,
    isIndex: false,
  };
}

function writeResponse(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  if (body && res.req?.method !== 'HEAD') {
    res.end(body);
    return;
  }
  res.end();
}

function writePlain(res, statusCode, message) {
  writeResponse(
    res,
    statusCode,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'origin',
    },
    message
  );
}

function writeHtml(res, statusCode, html) {
  writeResponse(
    res,
    statusCode,
    {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'origin',
    },
    html
  );
}

function createProxyUnavailablePage(route) {
  const target = route?.upstream?.origin ?? 'upstream dev server';
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Haven Renderer Not Ready</title></head>',
    '<body style="font-family: system-ui, sans-serif; margin: 2rem; color: #fff; background: #0f172a;">',
    '<h1 style="margin: 0 0 0.75rem;">Haven dev renderer is not ready</h1>',
    `<p style="line-height:1.5; max-width: 48rem;">The local renderer entry proxy is running, but it could not reach the Forge webpack dev server at <code>${target}</code>.</p>`,
    '<p style="line-height:1.5; max-width: 48rem;">Start or restart <code>npm start</code> and reload the window once the renderer dev server is available.</p>',
    '</body></html>',
  ].join('');
}

async function waitForDevUpstreams(routes, { timeoutMs = 5000, logger, debug }) {
  if (typeof fetch !== 'function') return;
  const proxyRoutes = routes.filter((route) => route.mode === 'proxy');
  if (proxyRoutes.length === 0) return;

  const startedAt = Date.now();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  while (Date.now() - startedAt < timeoutMs) {
    let allReady = true;

    for (const route of proxyRoutes) {
      try {
        const response = await fetch(`${route.upstream.origin}${route.upstream.entryPathname}`, {
          method: 'GET',
          redirect: 'manual',
        });
        if (!response.ok && response.status !== 304) {
          allReady = false;
          break;
        }
      } catch {
        allReady = false;
        break;
      }
    }

    if (allReady) {
      if (debug) logger.info?.('[renderer-entry] upstream dev server ready');
      return;
    }

    await delay(250);
  }

  if (debug) {
    logger.warn?.('[renderer-entry] upstream dev server readiness check timed out; continuing');
  }
}

function createRendererEntryService(options) {
  const {
    entries,
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    logger = console,
    debug = process.env.HAVEN_DEBUG_RENDERER_ENTRY === '1',
    waitForDevServer = true,
  } = options || {};

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createRendererEntryService requires at least one renderer entry.');
  }

  const routes = entries.map((entry) => parseWebpackEntry(entry));
  const routeByName = new Map(routes.map((route) => [route.entryName, route]));
  const canonicalOrigin = `http://${host}:${port}`;
  const allowedHostHeaders = buildAllowedHostHeaders({ host, port });

  let server = null;
  let proxy = null;
  let started = false;

  const logDebug = (message, meta) => {
    if (!debug) return;
    if (meta) {
      logger.info?.(message, meta);
      return;
    }
    logger.info?.(message);
  };

  const createRequestContext = (req) => {
    const parsedUrl = parseRequestUrl(req.url, canonicalOrigin);
    return {
      parsedUrl,
      pathname: parsedUrl?.pathname ?? '',
      search: parsedUrl?.search ?? '',
      hostHeader: String(req.headers.host || '').toLowerCase(),
    };
  };

  const validateRequest = (req, res, ctx) => {
    if (!isAllowedHostHeader(ctx.hostHeader, allowedHostHeaders)) {
      writePlain(res, 400, 'Invalid Host header');
      return false;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writePlain(res, 405, 'Method Not Allowed');
      return false;
    }

    if (!ctx.parsedUrl) {
      writePlain(res, 400, 'Invalid request URL');
      return false;
    }

    return true;
  };

  const serveStaticFile = async (req, res, route, ctx) => {
    const target = getStaticTarget(route, ctx.pathname);
    if (!target) {
      writePlain(res, 404, 'Not Found');
      return;
    }
    if (target.error) {
      writePlain(res, target.error, target.error === 400 ? 'Bad Request' : 'Not Found');
      return;
    }

    let stats;
    try {
      stats = await fsp.stat(target.filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        writePlain(res, 404, 'Not Found');
        return;
      }
      throw error;
    }

    if (!stats.isFile()) {
      writePlain(res, 404, 'Not Found');
      return;
    }

    const headers = {
      'Content-Type': getContentType(target.filePath),
      'Content-Length': String(stats.size),
      'Cache-Control': getCacheControlForFile(target.filePath),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'origin',
    };

    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(target.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        writePlain(res, 500, 'Internal Server Error');
        return;
      }
      res.destroy();
    });
    stream.pipe(res);
  };

  const proxyRequest = (req, res, route, ctx) => {
    if (!proxy) {
      writePlain(res, 500, 'Renderer proxy is not initialized');
      return;
    }

    const upstreamPath = getProxyUpstreamPath(route, ctx.pathname, ctx.search);
    if (!upstreamPath) {
      writePlain(res, 404, 'Not Found');
      return;
    }

    req.url = upstreamPath;

    proxy.web(
      req,
      res,
      {
        target: route.upstream.origin,
      },
      () => {
        if (!res.headersSent) {
          writeHtml(res, 502, createProxyUnavailablePage(route));
        }
      }
    );
  };

  const requestHandler = (req, res) => {
    const ctx = createRequestContext(req);

    if (!validateRequest(req, res, ctx)) return;

    if (ctx.pathname === '/') {
      res.writeHead(302, {
        Location: routes[0].localPathPrefix,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'origin',
      });
      res.end();
      return;
    }

    let route = findRouteForPath(routes, ctx.pathname);
    if (!route && isAllowedDevProxyAuxPath(ctx.pathname)) {
      route = routes.find((candidate) => candidate.mode === 'proxy') || null;
      if (route && route.mode === 'proxy' && proxy) {
        req.url = `${ctx.pathname}${ctx.search || ''}`;
        proxy.web(req, res, { target: route.upstream.origin });
        return;
      }
    }
    if (!route) {
      writePlain(res, 404, 'Not Found');
      return;
    }

    logDebug('[renderer-entry] request', {
      method: req.method,
      path: ctx.pathname,
      route: route.entryName,
      mode: route.mode,
    });

    if (route.mode === 'proxy') {
      proxyRequest(req, res, route, ctx);
      return;
    }

    void serveStaticFile(req, res, route, ctx).catch((error) => {
      logger.error?.('[renderer-entry] static serve error', error);
      if (!res.headersSent) {
        writePlain(res, 500, 'Internal Server Error');
        return;
      }
      res.destroy();
    });
  };

  const upgradeHandler = (req, socket, head) => {
    const ctx = createRequestContext(req);

    if (!ctx.parsedUrl || !isAllowedHostHeader(ctx.hostHeader, allowedHostHeaders)) {
      socket.destroy();
      return;
    }

    let route = findRouteForPath(routes, ctx.pathname);
    if (!route && isAllowedDevProxyAuxPath(ctx.pathname)) {
      route = routes.find((candidate) => candidate.mode === 'proxy') || null;
      if (route && proxy) {
        req.url = `${ctx.pathname}${ctx.search || ''}`;
        proxy.ws(req, socket, head, { target: route.upstream.origin });
        return;
      }
    }
    if (!route || route.mode !== 'proxy' || !proxy) {
      socket.destroy();
      return;
    }

    const upstreamPath = getProxyUpstreamPath(route, ctx.pathname, ctx.search);
    if (!upstreamPath) {
      socket.destroy();
      return;
    }

    req.url = upstreamPath;
    proxy.ws(req, socket, head, { target: route.upstream.origin });
  };

  async function start() {
    if (started) return;

    if (routes.some((route) => route.mode === 'proxy')) {
      proxy = httpProxy.createProxyServer({
        ws: true,
        secure: false,
        changeOrigin: false,
      });

      proxy.on('error', (error, req, resOrSocket) => {
        logger.error?.('[renderer-entry] proxy error', error);
        if (!resOrSocket) return;

        if (typeof resOrSocket.writeHead === 'function') {
          if (!resOrSocket.headersSent) {
            writeHtml(resOrSocket, 502, createProxyUnavailablePage(findRouteForPath(routes, parseRequestUrl(req?.url, canonicalOrigin)?.pathname || '')));
          } else {
            resOrSocket.end();
          }
          return;
        }

        if (typeof resOrSocket.destroy === 'function') {
          resOrSocket.destroy();
        }
      });
    }

    server = http.createServer(requestHandler);
    server.on('upgrade', upgradeHandler);

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });

    started = true;
    logDebug('[renderer-entry] started', {
      origin: canonicalOrigin,
      routes: routes.map((route) => ({
        entryName: route.entryName,
        mode: route.mode,
        localPathPrefix: route.localPathPrefix,
        upstream: route.mode === 'proxy' ? route.upstream.origin : undefined,
        staticRootDir: route.mode === 'static' ? route.staticRootDir : undefined,
      })),
    });

    if (waitForDevServer) {
      await waitForDevUpstreams(routes, { logger, debug });
    }
  }

  async function stop() {
    if (!started) return;

    started = false;

    if (proxy) {
      proxy.close?.();
      proxy = null;
    }

    if (server) {
      const currentServer = server;
      server = null;
      await new Promise((resolve) => {
        currentServer.close(() => resolve());
      });
    }
  }

  function getEntryUrl(entryName) {
    const route = routeByName.get(entryName);
    if (!route) {
      throw new Error(`Unknown renderer entry "${entryName}"`);
    }
    return `${canonicalOrigin}${route.localPathPrefix}`;
  }

  function getCanonicalOrigin() {
    return canonicalOrigin;
  }

  function isRendererDocumentUrl(urlString) {
    if (typeof urlString !== 'string' || urlString.length === 0) return false;
    try {
      const parsed = new URL(urlString);
      if (`${parsed.protocol}//${parsed.host}` !== canonicalOrigin) {
        return false;
      }
      return Boolean(findRouteForPath(routes, parsed.pathname));
    } catch {
      return false;
    }
  }

  function getRegisteredEntryNames() {
    return routes.map((route) => route.entryName);
  }

  function getCspConnectSrcOrigins() {
    const origins = new Set();
    for (const route of routes) {
      if (route.mode !== 'proxy' || !route.upstream?.origin) continue;
      try {
        const parsed = new URL(route.upstream.origin);
        const candidates = new Set([route.upstream.origin]);

        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          const aliasHost = parsed.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
          const aliasUrl = new URL(route.upstream.origin);
          aliasUrl.hostname = aliasHost;
          candidates.add(aliasUrl.origin);
        }

        for (const candidateOrigin of candidates) {
          origins.add(candidateOrigin);
          const candidateParsed = new URL(candidateOrigin);
          const wsProtocol = candidateParsed.protocol === 'https:' ? 'wss:' : 'ws:';
          origins.add(`${wsProtocol}//${candidateParsed.host}`);
        }
      } catch {
        // Ignore malformed upstream origins; parseWebpackEntry already validates these.
      }
    }
    return Array.from(origins);
  }

  return {
    start,
    stop,
    getEntryUrl,
    getCanonicalOrigin,
    isRendererDocumentUrl,
    getRegisteredEntryNames,
    getCspConnectSrcOrigins,
  };
}

module.exports = {
  DEFAULT_RENDERER_ENTRY_HOST: DEFAULT_HOST,
  DEFAULT_RENDERER_ENTRY_PORT: DEFAULT_PORT,
  createRendererEntryService,
  _private: {
    parseWebpackEntry,
    normalizeLocalPathPrefix,
    isAllowedHostHeader,
    buildAllowedHostHeaders,
    getProxyUpstreamPath,
    getStaticTarget,
    getDirectoryLikeWebPath,
    getCacheControlForFile,
    isAllowedDevProxyAuxPath,
  },
};
