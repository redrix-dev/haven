import { createLocalStoragePersistence } from "@shared/core/persistence/createLocalStoragePersistence";
import type { DevicePersistence } from "@shared/core/persistence/DevicePersistence";
import { createTauriPluginStorePersistence } from "./createTauriPluginStorePersistence";
import { isTauriRuntime } from "./isTauriRuntime";

/**
 * Host persistence for the Tauri desktop app.
 * Prefers tauri-plugin-store (app data dir); falls back to webview localStorage
 * when not in the native shell (Vite browser dev) or if the plugin fails to init.
 */
export async function createTauriPersistence(): Promise<DevicePersistence> {
  if (!isTauriRuntime()) {
    return createLocalStoragePersistence();
  }

  try {
    return await createTauriPluginStorePersistence();
  } catch (error) {
    console.warn(
      "[TauriPersistence] plugin-store unavailable, falling back to localStorage",
      error,
    );
    return createLocalStoragePersistence();
  }
}
