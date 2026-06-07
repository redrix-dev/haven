import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";

// Dedicated Vite config for the Tauri/Solid spike. Kept separate from the
// React `vite.config.ts` at the repo root so the two stacks never interfere.
export default defineConfig({
  plugins: [solid()],
  root: __dirname,
  publicDir: false,
  resolve: {
    alias: {
      "@solid-client": path.resolve(__dirname, "../../packages/solid-client/src"),
      "@solid-bindings": path.resolve(__dirname, "../../packages/solid-bindings/src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/tauri"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  // Tauri controls the terminal; don't let Vite wipe its output.
  clearScreen: false,
});
