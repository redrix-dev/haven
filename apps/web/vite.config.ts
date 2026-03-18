import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const env = loadEnv(mode, repoRoot, '');

  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'src'),
    publicDir: path.resolve(__dirname, 'public'),
    resolve: {
      alias: {
        '@electron': path.resolve(repoRoot, './apps/electron/src'),
        '@web': path.resolve(repoRoot, './apps/web/src'),
        '@mobile': path.resolve(repoRoot, './apps/mobile/src'),
        '@shared': path.resolve(repoRoot, './packages/shared/src'),
        '@client': path.resolve(repoRoot, './packages/shared/src/client'),
        '@platform': path.resolve(repoRoot, './packages/shared/src/platform'),
        '@test-support': path.resolve(repoRoot, './tooling/test-support'),
      },
    },
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV),
      'process.env.WEB_PUSH_VAPID_PUBLIC_KEY': JSON.stringify(env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY),
      'process.env.ENABLE_NOTIFICATION_DEVTOOLS': JSON.stringify(
        env.VITE_ENABLE_NOTIFICATION_DEVTOOLS
      ),
      'process.env.PUBLIC_WEBCLIENT_URL': JSON.stringify(env.VITE_PUBLIC_WEBCLIENT_URL),
      'process.env.VITE_PUBLIC_WEBCLIENT_URL': JSON.stringify(env.VITE_PUBLIC_WEBCLIENT_URL),
      'process.env.VITE_IOS_APP_STORE_URL': JSON.stringify(env.VITE_IOS_APP_STORE_URL),
      'process.env.VITE_ANDROID_PLAY_STORE_URL': JSON.stringify(
        env.VITE_ANDROID_PLAY_STORE_URL
      ),
    },
    build: {
      outDir: '../../dist/web',
      emptyOutDir: true,
    },
    server: {
      host: true,
      allowedHosts: ['all', 'local-haven.redrixx.com'],
    },
  };
});
