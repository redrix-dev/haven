import { createContext, useContext, type JSX } from "solid-js";

/**
 * The shell-agnostic capability interface + the context that distributes it.
 *
 * The interface is DEFINED here (the contexts layer) because providers and
 * features consume it through useBridge(), and dependencies only flow down.
 * The root `bridge.ts` re-exports it as the public surface shells implement
 * (apps/tauri/src/bridge.ts) — see SOLID_CLIENT_SHAPE.md.
 *
 * `bridge` may be undefined (plain browser tab) — useBridge() always returns
 * a usable implementation by falling back to web equivalents per capability.
 */

export type PopoutOptions = {
  /** Stable window label — reusing it focuses the existing popout. */
  label: string;
  title?: string;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
};

export type BridgeCapabilities = {
  /** Native shell can pre-create hidden route windows, then show on demand. */
  preparePopout?: boolean;
  /** Browser shell can portal UI into a same-origin child window. */
  browserPortalPopout?: boolean;
};

export type Platform = "macos" | "windows" | "linux";

/** One selectable audio device reported by the native sidecar. */
export type VoiceDeviceInfo = {
  /** cpal device name — stable enough to re-select within a session. */
  id: string;
  label: string;
};

/**
 * A structured event from the native sidecar. The wire form is newline-
 * delimited JSON (one object per line); this is the parsed shape, mirroring
 * the sidecar's `protocol::Event`.
 */
export type VoiceEvent =
  | { type: "connected" }
  | { type: "ready" }
  | { type: "disconnected" }
  | { type: "error"; message: string }
  | { type: "devices"; inputs: VoiceDeviceInfo[]; outputs: VoiceDeviceInfo[] }
  | { type: "speaking"; identities: string[] };

/**
 * Native voice, mediated by the shell. Present only where the webview can't do
 * WebRTC itself (Linux/WebKitGTK): the shell spawns a native LiveKit sidecar
 * and the UI drives it through here instead of livekit-client. Absent
 * everywhere else, so VoiceProvider falls back to the in-webview Room.
 */
export type VoiceBridge = {
  /** Join the room named by `token` (from the voice-token edge function). */
  join(serverUrl: string, token: string): Promise<void>;
  /** Mute/unmute the local microphone. */
  setMuted(muted: boolean): Promise<void>;
  /** Leave the room and stop the sidecar. */
  leave(): Promise<void>;
  /**
   * Ask the sidecar to enumerate audio devices. The result arrives
   * asynchronously as a `devices` event on `onEvent`.
   */
  enumerateDevices(): Promise<void>;
  /** Switch the capture (microphone) device by id (cpal device name). */
  setInputDevice(id: string): Promise<void>;
  /** Switch the playback (speaker) device by id (cpal device name). */
  setOutputDevice(id: string): Promise<void>;
  /**
   * Subscribe to structured sidecar events (parsed from the JSON protocol).
   * Resolves with an unsubscribe fn.
   */
  onEvent(handler: (event: VoiceEvent) => void): Promise<() => void>;
};

/** Native window controls, used to drive custom (frameless) chrome. */
export type WindowControls = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore changes; resolves with an unsubscribe fn. */
  onMaximizeChange(cb: (maximized: boolean) => void): Promise<() => void>;
};

export type StagedUpdate = {
  version: string;
  currentVersion: string;
  notes?: string;
  /**
   * Forced update — surfaced as a blocking, explained prompt instead of a
   * dismissible pill. Marked by a `[critical]` tag in the release notes.
   */
  critical: boolean;
};

/** Desktop auto-update, mediated by the shell (GitHub Releases + minisign). */
export type UpdaterControls = {
  /** Installed app version, e.g. "2.0.0". */
  currentVersion(): Promise<string>;
  /**
   * Check the release endpoint and download in the background. Resolves with a
   * staged update ready to apply, or null (already current / endpoint down).
   */
  checkAndStage(): Promise<StagedUpdate | null>;
  /** Install the staged update and relaunch into it. */
  applyAndRestart(): Promise<void>;
};

export interface HavenBridge {
  capabilities?: BridgeCapabilities;
  /** Demonstrates the Tauri `invoke` round-trip. */
  ping(name: string): Promise<string>;
  /**
   * Optionally warm a popout route without showing it yet. Native shells can
   * use this to hide WebView startup latency; browser shells leave it absent.
   */
  preparePopout?(path: string, options: PopoutOptions): Promise<void>;
  /**
   * Open (or focus) a popout window pointed at an app route — the window
   * model from SOLID_CLIENT_SHAPE.md: a window is an OS viewport on a route.
   * Browser shells without a bridge fall back to window.open.
   */
  openPopout(path: string, options: PopoutOptions): Promise<void>;
  /**
   * Native window controls for custom (frameless) chrome. Absent in a plain
   * browser tab, which keeps its own chrome — chrome renders only when present.
   */
  window?: WindowControls;
  /** Desktop auto-update (GitHub Releases). Absent in a plain browser. */
  updater?: UpdaterControls;
  /** Host OS — lets chrome differ per platform (e.g. macOS traffic lights). */
  platform?: Platform;
  /**
   * Native voice sidecar. Present only where the webview lacks WebRTC
   * (Linux/WebKitGTK); VoiceProvider uses it instead of livekit-client there.
   */
  voice?: VoiceBridge;
  /**
   * Subscribe to incoming deep links (`haven://…`); resolves with an
   * unsubscribe fn. Absent in a plain browser, which uses normal URLs.
   */
  onDeepLink?(handler: (url: string) => void): Promise<() => void>;
}

const BridgeContext = createContext<HavenBridge>();

/** Browser fallback: same capabilities, web primitives. */
const webBridge: HavenBridge = {
  capabilities: { browserPortalPopout: true },
  ping: async (name: string) => `pong:${name}`,
  openPopout: async (path: string, options: PopoutOptions) => {
    const width = options.width ?? 340;
    const height = options.height ?? 520;
    window.open(
      path,
      options.label,
      `popup=yes,width=${width},height=${height}`,
    );
  },
};

export function BridgeProvider(props: {
  bridge?: HavenBridge;
  children: JSX.Element;
}) {
  return (
    <BridgeContext.Provider value={props.bridge ?? webBridge}>
      {props.children}
    </BridgeContext.Provider>
  );
}

export function useBridge(): HavenBridge {
  return useContext(BridgeContext) ?? webBridge;
}
