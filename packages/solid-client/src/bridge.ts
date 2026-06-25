/**
 * Shell-agnostic capability interface the Solid UI consumes — the public
 * surface shells implement (see apps/tauri/src/bridge.ts).
 *
 * The definition lives in contexts/BridgeProvider.tsx (the layer that
 * distributes it to features); this root file re-exports it so shells keep a
 * stable import path. The UI never talks to Tauri/Electron directly: a shell
 * injects an implementation at bootstrap, and `solid-client` stays portable
 * (it also runs in a plain browser with no bridge at all).
 */
export type {
  HavenBridge,
  PopoutOptions,
  WindowControls,
  StagedUpdate,
  UpdaterControls,
  Platform,
} from "./contexts/BridgeProvider";
