import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Dedicated Vite config for the Tauri/Solid spike. Kept separate from the
// React `vite.config.ts` at the repo root so the two stacks never interfere.
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  // virtua's solid build carries an `@jsxImportSource` comment into output
  // vite-plugin-solid has already compiled — esbuild then warns about the
  // inert comment on every dev start and build. Silence that one log only.
  esbuild: {
    logOverride: { "unsupported-jsx-comment": "silent" },
  },
  root: __dirname,
  publicDir: false,
  envDir: path.resolve(__dirname, "../.."),
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
    outDir: path.resolve(__dirname, "../../dist/tauri"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    // The Vite root contains src-tauri. Without this, Vite watches Cargo's
    // target/ and dies with EBUSY when Cargo is mid-write on a build-script
    // exe (seen on Windows during a cold `tauri dev` build).
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // Tauri controls the terminal; don't let Vite wipe its output.
  clearScreen: false,
});
