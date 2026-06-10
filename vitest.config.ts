import path from 'node:path';
import { defineConfig } from 'vitest/config';
import VitestMarkdownReporter from './tooling/test-support/reporters/vitestMarkdownReporter';

const markdownOutputFile =
  process.env.VITEST_MARKDOWN === '1' || process.env.VITEST_MARKDOWN_OUTPUT_FILE
    ? process.env.VITEST_MARKDOWN_OUTPUT_FILE || './test-results.md'
    : null;

const conditionalReporters = markdownOutputFile
  ? [
      'default',
      new VitestMarkdownReporter({
        append: process.env.VITEST_MARKDOWN_APPEND === '1',
        outputFile: markdownOutputFile,
        runLabel: process.env.VITEST_MARKDOWN_RUN_LABEL?.trim() || null,
      }),
    ]
  : undefined;

export default defineConfig({
  resolve: {
    // Array form so we can match `solid-js` exactly (regex) without also
    // catching `solid-js/store` etc. Order matters: most-specific first.
    alias: [
      // Vitest runs in a node env, where solid-js's `node` export condition
      // resolves to the non-reactive SSR build (dist/server.js). Force the
      // reactive development build so signals/memos actually update under test.
      {
        find: /^solid-js$/,
        replacement: path.resolve(__dirname, 'node_modules/solid-js/dist/dev.js'),
      },
      { find: '@mobile-data', replacement: path.resolve(__dirname, 'apps/mobile/src/data') },
      { find: /^@mobile-data\/(.*)/, replacement: path.resolve(__dirname, 'apps/mobile/src/data/$1') },
      // React is mobile-owned after the cleave: the root has no react install,
      // so mobile data tests (and zustand's react entry) resolve it from
      // apps/mobile/node_modules. Requires `npm run setup:mobile` first.
      { find: /^react$/, replacement: path.resolve(__dirname, 'apps/mobile/node_modules/react') },
      { find: /^react\/(.*)/, replacement: path.resolve(__dirname, 'apps/mobile/node_modules/react/$1') },
      {
        find: 'use-sync-external-store/shim/with-selector',
        replacement: path.resolve(__dirname, 'apps/mobile/node_modules/use-sync-external-store/shim/with-selector.js'),
      },
      // zustand's react-flavored entries must live next to a react install,
      // so they also come from the mobile tree. `zustand/vanilla` (all that
      // packages/shared may import) still resolves from the root install.
      { find: 'zustand/traditional', replacement: path.resolve(__dirname, 'apps/mobile/node_modules/zustand/traditional') },
      { find: /^zustand$/, replacement: path.resolve(__dirname, 'apps/mobile/node_modules/zustand') },
      { find: '@solid-client', replacement: path.resolve(__dirname, 'packages/solid-client/src') },
      { find: '@shared', replacement: path.resolve(__dirname, 'packages/shared/src') },
      {
        find: '@platform/assets/runtimeAudio',
        replacement: path.resolve(__dirname, 'packages/shared/src/platform/assets/runtimeAudio'),
      },
      { find: '@platform', replacement: path.resolve(__dirname, 'packages/shared/src/platform') },
      { find: '@test-support', replacement: path.resolve(__dirname, 'tooling/test-support') },
    ],
  },
  test: {
    globals: true,
    fileParallelism: false,
    environment: 'node',
    setupFiles: ['tooling/test-support/setup/env.ts', 'tooling/test-support/setup/jsdom.ts'],
    include: [
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ],
    exclude: ['node_modules/**', '**/node_modules/**'],
    ...(conditionalReporters ? { reporters: conditionalReporters } : {}),
  },
});

