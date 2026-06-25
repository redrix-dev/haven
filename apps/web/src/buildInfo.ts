// These are replaced at build time by Vite `define` (see vite.config.ts).
declare const __HAVEN_VERSION__: string;
declare const __HAVEN_COMMIT__: string;
declare const __HAVEN_BUILD_TIME__: string;

/**
 * The web "version": semver from package.json + the commit SHA Vercel built
 * from + the build timestamp. This is the web analog of the desktop updater's
 * `currentVersion()` — web has no semver tag of its own (it tracks `main`),
 * so the SHA is the real identity. See docs/RELEASE_CADENCE.md.
 */
export const buildInfo = {
  version: __HAVEN_VERSION__,
  commit: __HAVEN_COMMIT__,
  buildTime: __HAVEN_BUILD_TIME__,
  /** e.g. "2.0.0+a1b2c3d" */
  stamp: `${__HAVEN_VERSION__}+${__HAVEN_COMMIT__}`,
} as const;
