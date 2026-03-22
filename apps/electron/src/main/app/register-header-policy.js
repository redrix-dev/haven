const { buildRendererCsp } = require('../renderer-document-csp');

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
};

module.exports = {
  registerRendererDocumentHeaderPolicy,
};
