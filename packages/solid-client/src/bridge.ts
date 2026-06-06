/**
 * Shell-agnostic capability interface the Solid UI consumes.
 *
 * The UI never talks to Tauri/Electron directly — a shell injects an
 * implementation of this interface (see apps/tauri/src/bridge.ts). This mirrors
 * the platform-injection pattern used on mobile and keeps `solid-client`
 * portable (it also runs in a plain browser with no bridge at all).
 *
 * When we wire `@shared` in later, the real backend-access methods get added
 * here and implemented per shell.
 */
export interface HavenBridge {
  /** Demonstrates the Tauri `invoke` round-trip. */
  ping(name: string): Promise<string>;
}
