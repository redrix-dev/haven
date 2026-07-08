import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type {
  HavenBridge,
  PopoutOptions,
  StagedUpdate,
  Platform,
} from "@solid-client/bridge";

/**
 * Tauri implementation of the shell-agnostic HavenBridge.
 *
 * This is the seam where shell capabilities (window chrome, updater, deep
 * links) get mirrored onto Tauri APIs, designed to line up with the mobile
 * platform layer. The Solid UI never imports `@tauri-apps/*` directly — it
 * goes through this object.
 */

// The update downloaded by `checkAndStage`, held until `applyAndRestart`.
let stagedUpdate: Update | null = null;

export const tauriBridge: HavenBridge = {
  capabilities: { preparePopout: true },
  ping: (name: string) => invoke<string>("ping", { name }),

  preparePopout: async (path: string, options: PopoutOptions) => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(options.label);
    if (existing) return;

    new WebviewWindow(options.label, {
      url: path,
      title: options.title ?? "Haven",
      width: options.width ?? 340,
      height: options.height ?? 520,
      alwaysOnTop: options.alwaysOnTop ?? false,
      visible: false,
      backgroundColor: getPopoutBackgroundColor(),
    });
  },

  openPopout: async (path: string, options: PopoutOptions) => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(options.label);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    new WebviewWindow(options.label, {
      url: path,
      title: options.title ?? "Haven",
      width: options.width ?? 340,
      height: options.height ?? 520,
      alwaysOnTop: options.alwaysOnTop ?? false,
      backgroundColor: getPopoutBackgroundColor(),
    });
  },

  platform: detectPlatform(),

  // Native voice sidecar — only meaningful on Linux (WebKitGTK has no WebRTC),
  // but harmless to expose everywhere; VoiceProvider gates on platform.
  voice: {
    join: (serverUrl: string, token: string) =>
      invoke<void>("voice_join", { url: serverUrl, token }),
    setMuted: (muted: boolean) =>
      invoke<void>("voice_send_command", {
        command: muted ? "mute" : "unmute",
      }),
    leave: () => invoke<void>("voice_leave"),
    onEvent: async (handler: (event: string) => void) => {
      const { listen } = await import("@tauri-apps/api/event");
      return await listen<string>("voice://event", (event) =>
        handler(event.payload),
      );
    },
  },

  window: {
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
    close: () => getCurrentWindow().close(),
    isMaximized: () => getCurrentWindow().isMaximized(),
    onMaximizeChange: async (cb) => {
      const w = getCurrentWindow();
      return w.onResized(async () => cb(await w.isMaximized()));
    },
  },

  updater: {
    currentVersion: () => getVersion(),

    checkAndStage: async (): Promise<StagedUpdate | null> => {
      const update = await check();
      if (!update) {
        stagedUpdate = null;
        return null;
      }
      // Download + verify signature now so applying is instant later.
      await update.download();
      stagedUpdate = update;

      const notes = update.body ?? undefined;
      return {
        version: update.version,
        currentVersion: update.currentVersion,
        notes,
        critical: (notes ?? "").toLowerCase().includes("[critical]"),
      };
    },

    applyAndRestart: async () => {
      if (stagedUpdate) await stagedUpdate.install();
      await relaunch();
    },
  },

  onDeepLink: async (handler) => {
    const unsubscribers: Array<() => void> = [];

    // macOS (running app) + the plugin's native delivery.
    const { onOpenUrl, getCurrent } = await import(
      "@tauri-apps/plugin-deep-link"
    );
    unsubscribers.push(
      await onOpenUrl((urls) => urls.forEach((url) => handler(url))),
    );

    // Windows/Linux (running app): forwarded from the single-instance callback.
    const { listen } = await import("@tauri-apps/api/event");
    unsubscribers.push(
      await listen<string>("deep-link-url", (event) => handler(event.payload)),
    );

    // Cold start: the app was launched by a deep link.
    const initial = await getCurrent();
    initial?.forEach((url) => handler(url));

    return () => unsubscribers.forEach((unsub) => unsub());
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Windows")) return "windows";
  return "linux";
}

function getPopoutBackgroundColor(): string {
  // The CURRENT theme's surface-0 (called from the themed main window), so the
  // new window's pre-paint frame matches the theme.
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface-0")
      .trim() || "#0d1626"
  );
}
