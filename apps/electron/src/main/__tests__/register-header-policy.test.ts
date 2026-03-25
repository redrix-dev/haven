import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let registerRendererDocumentHeaderPolicy: any;

describe('registerRendererDocumentHeaderPolicy', () => {
  beforeAll(async () => {
    ({ registerRendererDocumentHeaderPolicy } = await import(
      '../app/register-header-policy.js'
    ));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('injects a fallback referer for YouTube embed requests when the renderer has no HTTP origin', () => {
    const onHeadersReceived = vi.fn();
    const onBeforeSendHeaders = vi.fn();
    const sessionRef = {
      webRequest: {
        onHeadersReceived,
        onBeforeSendHeaders,
      },
    };

    registerRendererDocumentHeaderPolicy({
      sessionRef,
      rendererDocumentUrls: ['file:///C:/Program%20Files/Haven/resources/app/index.html'],
      rendererOriginUrl: 'file:///C:/Program%20Files/Haven/resources/app/index.html',
    });

    expect(onBeforeSendHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: expect.arrayContaining([
          'https://www.youtube.com/embed/*',
          'https://www.youtube-nocookie.com/embed/*',
        ]),
      }),
      expect.any(Function),
    );

    const handler = onBeforeSendHeaders.mock.calls[0][1];
    const callback = vi.fn();

    handler(
      {
        requestHeaders: {
          Accept: 'text/html',
        },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: 'text/html',
        Referer: 'https://projects.haven.redrixx.com/',
      },
    });
  });

  it('reuses the renderer origin as the YouTube embed referer when one is available', () => {
    const onHeadersReceived = vi.fn();
    const onBeforeSendHeaders = vi.fn();
    const sessionRef = {
      webRequest: {
        onHeadersReceived,
        onBeforeSendHeaders,
      },
    };

    registerRendererDocumentHeaderPolicy({
      sessionRef,
      rendererDocumentUrls: ['http://127.0.0.1:3000/main_window'],
      rendererOriginUrl: 'http://127.0.0.1:3000/main_window',
    });

    const handler = onBeforeSendHeaders.mock.calls[0][1];
    const callback = vi.fn();

    handler(
      {
        requestHeaders: {},
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Referer: 'http://127.0.0.1:3000/',
      },
    });
  });

  it('replaces CSP and referrer policy headers on the renderer document response', () => {
    const onHeadersReceived = vi.fn();
    const onBeforeSendHeaders = vi.fn();
    const sessionRef = {
      webRequest: {
        onHeadersReceived,
        onBeforeSendHeaders,
      },
    };

    registerRendererDocumentHeaderPolicy({
      sessionRef,
      rendererDocumentUrls: ['http://127.0.0.1:3000/main_window'],
      rendererOriginUrl: 'http://127.0.0.1:3000/main_window',
    });

    const handler = onHeadersReceived.mock.calls[0][0];
    const callback = vi.fn();

    handler(
      {
        url: 'http://127.0.0.1:3000/main_window',
        resourceType: 'mainFrame',
        responseHeaders: {
          'Content-Security-Policy': ["default-src 'none'"],
          'Referrer-Policy': ['no-referrer'],
          'X-Frame-Options': ['DENY'],
        },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': [expect.stringContaining("default-src 'self'")],
        'Referrer-Policy': ['origin'],
        'X-Frame-Options': ['DENY'],
      }),
    });
  });
});
