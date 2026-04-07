import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const rendererBoundaryFiles = [
  'packages/shared/src/client/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/components/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/contexts/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/lib/hooks/**/*.{ts,tsx,js,jsx}',
  'packages/shared/src/lib/voice/**/*.{ts,tsx,js,jsx}',
  'apps/web/src/**/*.{ts,tsx,js,jsx}',
  'apps/electron/src/renderer/**/*.{ts,tsx,js,jsx}',
];

const rendererBoundaryRestrictions = [
  {
    group: ['@platform/ipc/*', '**/platform/ipc/*'],
    message:
      'Renderer/features must not import shared/ipc. Use getAppHost() from @shared/platform/appHost (registered in the Electron renderer) for desktop capabilities.',
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
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'desktop',
          message:
            'Use getAppHost() from @shared/platform/appHost in app code; only packages/shared/src/platform/desktop/client.ts may read window.desktop.',
        },
        {
          object: 'window',
          property: 'havenDesktop',
          message:
            'Use getAppHost() from @shared/platform/appHost instead of legacy window.havenDesktop access.',
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
    files: [
      'packages/shared/src/app/hooks/useChatAppOrchestration.ts',
      'packages/shared/src/app/components/ChatAppModals.tsx',
    ],
    rules: {
      'max-lines': [
        'warn',
        { max: 550, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['packages/shared/src/**/*.{ts,tsx}'],
    ignores: ['packages/shared/src/platform/desktop/client.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@platform/desktop/client',
              message:
                'Import getAppHost from @shared/platform/appHost instead. Electron registers the real bridge in apps/electron/src/renderer/registerElectronAppHost.ts.',
            },
          ],
        },
      ],
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
