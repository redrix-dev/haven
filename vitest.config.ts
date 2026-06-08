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
      // reactive development build so `@solid-bindings` signals/memos actually
      // update under test. Scoped to the bare specifier — React tests never
      // import solid-js, so this has zero blast radius on the rest of the suite.
      {
        find: /^solid-js$/,
        replacement: path.resolve(__dirname, 'node_modules/solid-js/dist/dev.js'),
      },
      { find: '@electron', replacement: path.resolve(__dirname, 'apps/electron/src') },
      { find: '@web', replacement: path.resolve(__dirname, 'apps/web/src') },
      { find: '@web-client', replacement: path.resolve(__dirname, 'packages/web-client/src') },
      { find: '@react-bindings', replacement: path.resolve(__dirname, 'packages/react-bindings/src') },
      { find: '@solid-bindings', replacement: path.resolve(__dirname, 'packages/solid-bindings/src') },
      { find: '@shared/app/ui', replacement: path.resolve(__dirname, 'packages/web-client/src/app-ui') },
      { find: '@shared', replacement: path.resolve(__dirname, 'packages/shared/src') },
      { find: '@client', replacement: path.resolve(__dirname, 'packages/shared/src/client') },
      {
        find: '@platform/assets/runtimeAudio',
        replacement: path.resolve(__dirname, 'packages/web-client/src/infrastructure/platform/assets/runtimeAudio'),
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
    exclude: ['node_modules/**', '**/node_modules/**', 'out/**', '.webpack/**'],
    ...(conditionalReporters ? { reporters: conditionalReporters } : {}),
  },
});

