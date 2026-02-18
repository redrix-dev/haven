import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const rendererBoundaryFiles = [
  'src/renderer.tsx',
  'src/components/**/*.{ts,tsx,js,jsx}',
  'src/contexts/**/*.{ts,tsx,js,jsx}',
  'src/lib/hooks/**/*.{ts,tsx,js,jsx}',
  'src/lib/voice/**/*.{ts,tsx,js,jsx}',
  'src/features/**/*.{ts,tsx,js,jsx}',
  'src/app/renderer/**/*.{ts,tsx,js,jsx}',
];

const rendererBoundaryRestrictions = [
  {
    group: ['@/shared/ipc/*', '**/shared/ipc/*'],
    message:
      'Renderer/features must not import shared/ipc. Use @/shared/desktop/client for desktop capabilities.',
  },
  {
    group: ['@/app/main/*', '**/app/main/*'],
    message: 'Renderer/features must not import app/main modules.',
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
    files: ['src/**/*.{ts,tsx,js,jsx}'],
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
          message: 'Use @/shared/desktop/client instead of window.desktop directly.',
        },
        {
          object: 'window',
          property: 'havenDesktop',
          message: 'Use @/shared/desktop/client instead of legacy window.havenDesktop access.',
        },
      ],
    },
  },
  {
    files: ['src/shared/desktop/client.ts'],
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
