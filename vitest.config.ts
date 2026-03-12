import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'apps/electron/src'),
      '@web-mobile': path.resolve(__dirname, 'apps/web-mobile/src'),
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@client': path.resolve(__dirname, 'packages/shared/src/client'),
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
    exclude: ['node_modules/**', 'out/**', '.webpack/**'],
  },
});

