/**
 * What the device keeps between launches: a synchronous key/value store each
 * platform provides, so what was kept can show on the first frame.
 *
 * Implementations:
 *   - createMmkvPersistence — mobile (apps/mobile/src/lib/createMmkvPersistence.ts)
 *   - createLocalStoragePersistence — web + Tauri webview fallback
 *   - createTauriPersistence — Tauri desktop (plugin-store, localStorage fallback)
 *   - createMemoryPersistence — tests and any host without a disk adapter
 *
 * Each host passes its own to HavenCore when it builds it; shared code never
 * imports a platform's storage.
 */
export interface DevicePersistence {
  getString(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
