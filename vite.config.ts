import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    root: 'src/web',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV),
      'process.env.WEB_PUSH_VAPID_PUBLIC_KEY': JSON.stringify(env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY),
    },
    build: {
      outDir: '../../dist/web'
    }
  }
})
