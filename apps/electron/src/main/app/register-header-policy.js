const { buildRendererCsp } = require('../renderer-entry-csp');

const registerRendererDocumentHeaderPolicy = ({ sessionRef, rendererEntryServiceRef }) => {
  sessionRef.webRequest.onHeadersReceived((details, callback) => {
    const url = typeof details.url === 'string' ? details.url : '';
    const isRendererDocument =
      details.resourceType === 'mainFrame' && rendererEntryServiceRef.isRendererDocumentUrl(url);

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
            rendererOrigin: rendererEntryServiceRef.getCanonicalOrigin(),
            extraConnectSrc: rendererEntryServiceRef.getCspConnectSrcOrigins(),
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
