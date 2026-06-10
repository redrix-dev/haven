import { invoke } from "@tauri-apps/api/core";
import type { HavenBridge } from "@solid-client/bridge";

/**
 * Tauri implementation of the shell-agnostic HavenBridge.
 *
 * This is the seam where shell capabilities (window chrome, updater, deep
 * links) get mirrored onto Tauri `invoke()` calls, designed to line up with
 * the mobile platform layer.
 */
export const tauriBridge: HavenBridge = {
  ping: (name: string) => invoke<string>("ping", { name }),
};
