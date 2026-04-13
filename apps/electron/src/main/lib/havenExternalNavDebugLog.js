/**
 * Temporary diagnostics for external browser tabs / shell.openExternal.
 *
 * REMOVE(HAVEN_EXTERNAL_NAV_DEBUG): Delete this entire file, then remove every
 * `require()` and `logHavenExternalNavDebug(...)` call. Repo search: HAVEN_EXTERNAL_NAV_DEBUG
 *
 * Logs go to the **main process** (terminal that runs `npm start` / Electron), not
 * the renderer DevTools console.
 */

/**
 * @param {import('electron').App | null | undefined} app
 * @param {string} phase
 * @param {Record<string, unknown>} [data]
 */
function logHavenExternalNavDebug(app, phase, data = {}) {
  if (!app || app.isPackaged) {
    return;
  }
  try {
    const line = {
      tag: "HAVEN_EXTERNAL_NAV_DEBUG",
      t: new Date().toISOString(),
      phase,
      ...data,
    };
    // stderr tends to surface reliably in forge/webpack parent output
    console.error("[HAVEN_EXTERNAL_NAV_DEBUG]", JSON.stringify(line));
  } catch (err) {
    console.error("[HAVEN_EXTERNAL_NAV_DEBUG]", phase, "log_failed", err);
  }
}

module.exports = {
  logHavenExternalNavDebug,
};
