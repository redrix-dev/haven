const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const rules = require('./webpack.rules');

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

const envFromFile = readEnvFile(path.resolve(__dirname, '.env'));
const supabaseUrl = process.env.SUPABASE_URL || envFromFile.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || envFromFile.SUPABASE_ANON_KEY || '';
const havenBackendMode =
  process.env.HAVEN_BACKEND_MODE || envFromFile.HAVEN_BACKEND_MODE || 'central_supabase';
const enableNotificationDevtools =
  process.env.ENABLE_NOTIFICATION_DEVTOOLS ||
  process.env.VITE_ENABLE_NOTIFICATION_DEVTOOLS ||
  envFromFile.ENABLE_NOTIFICATION_DEVTOOLS ||
  envFromFile.VITE_ENABLE_NOTIFICATION_DEVTOOLS ||
  '';
const publicWebclientUrl =
  process.env.PUBLIC_WEBCLIENT_URL ||
  process.env.VITE_PUBLIC_WEBCLIENT_URL ||
  envFromFile.PUBLIC_WEBCLIENT_URL ||
  envFromFile.VITE_PUBLIC_WEBCLIENT_URL ||
  '';

module.exports = {
  devtool: 'source-map',
  module: {
    rules,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'process.env.HAVEN_BACKEND_MODE': JSON.stringify(havenBackendMode),
      'process.env.ENABLE_NOTIFICATION_DEVTOOLS': JSON.stringify(enableNotificationDevtools),
      'process.env.PUBLIC_WEBCLIENT_URL': JSON.stringify(publicWebclientUrl),
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
