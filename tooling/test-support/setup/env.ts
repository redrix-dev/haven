import { TextDecoder, TextEncoder } from 'node:util';

process.env.NODE_ENV ??= 'test';
process.env.TZ ??= 'UTC';

if (typeof globalThis.TextEncoder === 'undefined') {
  // jsdom + some UI libs expect these globals.
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

