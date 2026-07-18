import path from "node:path";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// Isolated config for Tier-2 component-render tests (the async store-loop class
// that only reproduces under Solid's real client scheduler). vite-plugin-solid
// handles JSX transform + resolves solid-js/web to the CLIENT build, which the
// main config deliberately does not (it force-aliases solid-js to the SSR-safe
// dev build for the reactive-logic suite). Kept separate so the 170 node tests
// are untouched. Run via: vitest run --config vitest.tier2.config.ts
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: "@solid-client",
        replacement: path.resolve(__dirname, "packages/solid-client/src"),
      },
      {
        find: "@shared",
        replacement: path.resolve(__dirname, "packages/shared/src"),
      },
      {
        find: "@platform/assets/runtimeAudio",
        replacement: path.resolve(
          __dirname,
          "packages/shared/src/platform/assets/runtimeAudio",
        ),
      },
      {
        find: "@platform",
        replacement: path.resolve(__dirname, "packages/shared/src/platform"),
      },
      {
        find: "@test-support",
        replacement: path.resolve(__dirname, "tooling/test-support"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["packages/solid-client/src/**/*.tier2.test.{ts,tsx}"],
  },
});
