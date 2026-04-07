const { buildRendererCsp } = require('../renderer-document-csp');

const DEFAULT_YOUTUBE_EMBED_REFERER = 'https://projects.haven.redrixx.com/';
const YOUTUBE_EMBED_URL_FILTER = {
  urls: [
    'https://www.youtube.com/embed/*',
    'https://youtube.com/embed/*',
    'https://www.youtube-nocookie.com/embed/*',
    'https://youtube-nocookie.com/embed/*',
  ],
};

const normalizeRendererDocumentUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return '';
  }

  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    parsed.search = '';
    const normalizedUrl = parsed.toString();
    return normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;
  } catch {
    return '';
  }
};

const getRendererOrigin = (rawUrl) => {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return '';
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'file:') {
      return '';
    }
    return parsed.origin;
  } catch {
    return '';
  }
};

const toRefererUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return DEFAULT_YOUTUBE_EMBED_REFERER;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_YOUTUBE_EMBED_REFERER;
    }

    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return DEFAULT_YOUTUBE_EMBED_REFERER;
  }
};

const registerRendererDocumentHeaderPolicy = ({
  sessionRef,
  rendererDocumentUrls = [],
  rendererOriginUrl = '',
}) => {
  const normalizedRendererDocumentUrls = new Set(
    rendererDocumentUrls
      .map((url) => normalizeRendererDocumentUrl(url))
      .filter((url) => url.length > 0),
  );
  const rendererOrigin = getRendererOrigin(rendererOriginUrl);

  sessionRef.webRequest.onHeadersReceived((details, callback) => {
    const url = typeof details.url === 'string' ? details.url : '';
    const isRendererDocument =
      details.resourceType === 'mainFrame' &&
      normalizedRendererDocumentUrls.has(normalizeRendererDocumentUrl(url));

    if (!isRendererDocument) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...(details.responseHeaders || {}) };
    for (const headerName of Object.keys(responseHeaders)) {
      const normalized = headerName.toLowerCase();
      if (
        normalized === 'content-security-policy' ||
        normalized === 'content-security-policy-report-only' ||
        normalized === 'referrer-policy'
      ) {
        delete responseHeaders[headerName];
      }
    }

    callback({
      responseHeaders: {
        ...responseHeaders,
        'Content-Security-Policy': [
          buildRendererCsp({
            rendererOrigin,
          }),
        ],
        'Referrer-Policy': ['origin'],
      },
    });
  });

  const youtubeEmbedReferer = toRefererUrl(rendererOrigin);
  sessionRef.webRequest.onBeforeSendHeaders(
    YOUTUBE_EMBED_URL_FILTER,
    (details, callback) => {
      callback({
        requestHeaders: {
          ...(details.requestHeaders || {}),
          Referer: youtubeEmbedReferer,
        },
      });
    },
  );
};

module.exports = {
  registerRendererDocumentHeaderPolicy,
};
