const path = require("node:path");
const { fileURLToPath } = require("node:url");

/**
 * True when `targetUrl` should load inside this window (dev server reload, packaged
 * file bundle) rather than being delegated to the OS browser via `shell.openExternal`.
 *
 * @param {string} rendererEntryUrl
 * @param {string} targetUrl
 */
function isInAppNavigation(rendererEntryUrl, targetUrl) {
  try {
    const target = new URL(targetUrl);
    const base = new URL(rendererEntryUrl);

    if (target.protocol === "http:" || target.protocol === "https:") {
      if (base.protocol === "http:" || base.protocol === "https:") {
        return target.origin === base.origin;
      }
      return false;
    }

    if (target.protocol === "file:" && base.protocol === "file:") {
      const basePath = fileURLToPath(base.href);
      const targetPath = fileURLToPath(target.href);
      const baseDir = path.dirname(basePath);
      const norm = path.normalize(targetPath);
      const sep = path.sep;
      return norm === baseDir || norm.startsWith(baseDir + sep);
    }

    if (target.protocol === "about:") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = {
  isInAppNavigation,
};
