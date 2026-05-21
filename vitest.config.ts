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
    alias: {
      '@electron': path.resolve(__dirname, 'apps/electron/src'),
      '@web': path.resolve(__dirname, 'apps/web/src'),
      '@web-client': path.resolve(__dirname, 'packages/web-client/src'),
      '@shared/app/ui': path.resolve(__dirname, 'packages/web-client/src/app-ui'),
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@client': path.resolve(__dirname, 'packages/shared/src/client'),
      '@platform/assets/runtimeAudio': path.resolve(__dirname, 'packages/web-client/src/infrastructure/platform/assets/runtimeAudio'),
      '@platform': path.resolve(__dirname, 'packages/shared/src/platform'),
      '@test-support': path.resolve(__dirname, 'tooling/test-support'),
    },
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

