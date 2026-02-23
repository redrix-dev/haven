process.env.NODE_ENV ??= 'test';
process.env.TZ ??= 'UTC';

if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('node:util');
  // jsdom + some UI libs expect these globals.
  // @ts-expect-error Node util types are compatible with browser globals for tests.
  globalThis.TextEncoder = TextEncoder;
  // @ts-expect-error Node util types are compatible with browser globals for tests.
  globalThis.TextDecoder = TextDecoder;
}

