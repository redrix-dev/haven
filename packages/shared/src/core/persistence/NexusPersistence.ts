/**
 * Platform-agnostic key/value port used by every Nexus for persist/rehydrate.
 *
 * Implementations:
 *   - createMmkvPersistence — mobile (apps/mobile/src/lib/createMmkvPersistence.ts)
 *   - createLocalStoragePersistence — web + Tauri webview fallback
 *   - createTauriPersistence — Tauri desktop (plugin-store, localStorage fallback)
 *   - createMemoryPersistence — tests and any host without a disk adapter
 *
 * Hosts inject the appropriate implementation when constructing HavenCore.
 * The Nexus base class never imports a platform module directly.
 */
export interface NexusPersistence {
  getString(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
