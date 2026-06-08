const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const { createWebpackRules } = require('./webpack.rules');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const sharedResolve = {
  extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  alias: {
    '@electron': path.resolve(__dirname, 'apps/electron/src'),
    '@web': path.resolve(__dirname, 'apps/web/src'),
    '@web-client': path.resolve(__dirname, 'packages/web-client/src'),
    '@mobile-data': path.resolve(__dirname, 'apps/mobile/src/data'),
    '@shared/app/ui': path.resolve(__dirname, 'packages/web-client/src/app-ui'),
    '@shared': path.resolve(__dirname, 'packages/shared/src'),
    '@client': path.resolve(__dirname, 'packages/shared/src/client'),
    // Specific alias must come before the glob to take precedence
    '@platform/assets/runtimeAudio': path.resolve(__dirname, 'packages/web-client/src/infrastructure/platform/assets/runtimeAudio'),
    '@platform': path.resolve(__dirname, 'packages/shared/src/platform'),
    '@test-support': path.resolve(__dirname, 'tooling/test-support'),
  },
};

function createRendererBundleConfig(tsconfigFile) {
  const envFromFile = readEnvFile(path.resolve(__dirname, '.env'));
  const supabaseUrl = process.env.SUPABASE_URL || envFromFile.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || envFromFile.SUPABASE_ANON_KEY || '';
  const nodeEnv = process.env.NODE_ENV || envFromFile.NODE_ENV || 'development';
  const havenBackendMode =
    process.env.HAVEN_BACKEND_MODE || envFromFile.HAVEN_BACKEND_MODE || 'central_supabase';
  const isDev = nodeEnv !== 'production';

  return {
    // 'source-map' is high-quality but slow to generate and large. In dev use
    // 'cheap-module-source-map' — same line-level accuracy, no column mapping,
    // but ~3-5× faster to emit and much smaller output.
    devtool: isDev ? 'cheap-module-source-map' : 'source-map',

    // Persist the module graph to disk between restarts. On a warm start this
    // cuts cold-compile time from ~5-6 s down to ~300-500 ms. The cache is
    // automatically invalidated whenever this config file changes.
    cache: isDev
      ? {
          type: 'filesystem',
          buildDependencies: { config: [__filename] },
        }
      : false,

    module: {
      rules: createWebpackRules(tsconfigFile),
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
        'process.env.NODE_ENV': JSON.stringify(nodeEnv),
        'process.env.HAVEN_BACKEND_MODE': JSON.stringify(havenBackendMode),
      }),
    ],
    resolve: sharedResolve,
  };
}

module.exports = {
  createRendererBundleConfig,
  sharedResolve,
};
