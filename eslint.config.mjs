import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const rendererBoundaryFiles = [
  'packages/shared/src/client/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/components/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/contexts/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/lib/hooks/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/lib/voice/**/*.{ts,tsx,js,jsx}',
  'apps/web-mobile/src/**/*.{ts,tsx,js,jsx}',
  'apps/electron/src/renderer/**/*.{ts,tsx,js,jsx}',
];

const rendererBoundaryRestrictions = [
  {
    group: ['@platform/ipc/*', '**/platform/ipc/*'],
    message:
      'Renderer/features must not import shared/ipc. Use @platform/desktop/client for desktop capabilities.',
  },
  {
    group: ['@electron/main/*', '**/apps/electron/src/main/*'],
    message: 'Renderer/features must not import Electron main-process modules.',
  },
  {
    group: ['electron', 'electron/*'],
    message: 'Renderer/features must not import electron APIs directly.',
  },
  {
    group: ['node:*'],
    message: 'Renderer/features must not import Node built-ins.',
  },
];

export default [
  {
    ignores: ['node_modules/**', '.webpack/**', 'out/**', 'dist/**'],
  },
  {
    files: [
      'apps/**/*.{ts,tsx,js,jsx}',
      'packages/**/*.{ts,tsx,js,jsx}',
      'tooling/**/*.{ts,tsx,js,jsx}',
      'services/**/*.{ts,tsx,js,jsx}',
    ],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      ecmaVersion: 'latest',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'desktop',
          message: 'Use @platform/desktop/client instead of window.desktop directly.',
        },
        {
          object: 'window',
          property: 'havenDesktop',
          message: 'Use @platform/desktop/client instead of legacy window.havenDesktop access.',
        },
      ],
    },
  },
  {
    files: ['packages/shared/src/platform/desktop/client.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    files: rendererBoundaryFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: rendererBoundaryRestrictions,
        },
      ],
    },
  },
];
