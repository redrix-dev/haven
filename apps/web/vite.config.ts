import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import pkg from "../../package.json";

// Dedicated Vite config for the plain-browser (Vercel) web build. Mirrors the
// Tauri config but targets a static SPA: no Tauri shell, no fixed dev port
// quirks, and a `dist/web` output Vercel serves.

// Build stamp: package.json semver + the commit Vercel built from (or local
// git) + build time. Surfaced in-app as the web "version" (see buildInfo.ts).
function resolveCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  // virtua's solid build carries an `@jsxImportSource` comment into output;
  // vite-plugin-solid has already compiled — silence the inert-comment warning.
  esbuild: {
    logOverride: { "unsupported-jsx-comment": "silent" },
  },
  root: __dirname,
  base: "/",
  publicDir: false,
  envDir: path.resolve(__dirname, "../.."),
  define: {
    __HAVEN_VERSION__: JSON.stringify(pkg.version),
    __HAVEN_COMMIT__: JSON.stringify(resolveCommit()),
    __HAVEN_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@solid-client": path.resolve(
        __dirname,
        "../../packages/solid-client/src",
      ),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/web"),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
  },
});
