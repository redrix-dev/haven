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

export interface HavenBridge {
  /** Demonstrates the Tauri `invoke` round-trip. */
  ping(name: string): Promise<string>;
  /**
   * Open (or focus) a popout window pointed at an app route — the window
   * model from SOLID_CLIENT_SHAPE.md: a window is an OS viewport on a route.
   * Browser shells without a bridge fall back to window.open.
   */
  openPopout(path: string, options: PopoutOptions): Promise<void>;
}

const BridgeContext = createContext<HavenBridge>();

/** Browser fallback: same capabilities, web primitives. */
const webBridge: HavenBridge = {
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
