import { invoke } from "@tauri-apps/api/core";
import type { HavenBridge, PopoutOptions } from "@solid-client/bridge";

/**
 * Tauri implementation of the shell-agnostic HavenBridge.
 *
 * This is the seam where shell capabilities (window chrome, updater, deep
 * links) get mirrored onto Tauri APIs, designed to line up with the mobile
 * platform layer.
 */
export const tauriBridge: HavenBridge = {
  ping: (name: string) => invoke<string>("ping", { name }),

  openPopout: async (path: string, options: PopoutOptions) => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(options.label);
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow(options.label, {
      url: path,
      title: options.title ?? "Haven",
      width: options.width ?? 340,
      height: options.height ?? 520,
      alwaysOnTop: options.alwaysOnTop ?? false,
    });
  },
};
