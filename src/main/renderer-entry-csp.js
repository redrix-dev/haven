function buildRendererCsp({ rendererOrigin }) {
  const origin = typeof rendererOrigin === 'string' ? rendererOrigin : '';
  let rendererWebsocketOrigin = '';

  try {
    const parsed = new URL(origin);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    rendererWebsocketOrigin = `${wsProtocol}//${parsed.host}`;
  } catch {
    rendererWebsocketOrigin = '';
  }

  const connectSrc = [
    "'self'",
    'http://localhost:9000',
    'ws://localhost:9000',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.supabase.in',
    'wss://*.supabase.in',
    'stun:',
    'turn:',
  ];

  if (rendererWebsocketOrigin) {
    connectSrc.push(rendererWebsocketOrigin);
  }

  return (
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    `connect-src ${connectSrc.join(' ')}; ` +
    "media-src 'self' blob: mediastream: https:; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' data:; " +
    'child-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; ' +
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; ' +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none';"
  );
}

module.exports = {
  buildRendererCsp,
};

