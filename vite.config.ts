import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    root: "apps/web/src",
    publicDir: path.resolve(__dirname, "./apps/web/public"),
    resolve: {
      alias: {
        "@electron": path.resolve(__dirname, "./apps/electron/src"),
        "@web": path.resolve(__dirname, "./apps/web/src"),
        "@shared": path.resolve(__dirname, "./packages/shared/src"),
        "@client": path.resolve(__dirname, "./packages/shared/src/client"),
        "@platform": path.resolve(__dirname, "./packages/shared/src/platform"),
        "@test-support": path.resolve(__dirname, "./tooling/test-support"),
      },
    },
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY,
      ),
      "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
    },
    build: {
      outDir: "../../../dist/web",
      emptyOutDir: true,
    },
    server: {
      host: true,
      allowedHosts: ["all", "local-haven.redrixx.com"],
    },
  };
});
