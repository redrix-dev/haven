import { invoke } from "@tauri-apps/api/core";
import type { HavenBridge } from "@solid-client/bridge";

/**
 * Tauri implementation of the shell-agnostic HavenBridge.
 *
 * This is the seam where, later, we'll mirror the Electron `@platform/ipc`
 * contract onto Tauri `invoke()` calls and design backend-access methods to
 * line up with the mobile platform layer.
 */
export const tauriBridge: HavenBridge = {
  ping: (name: string) => invoke<string>("ping", { name }),
};
