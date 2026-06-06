import { dataCacheDebug, instrumentZustandStore } from "@shared/debug";
import { useAuthStore } from "@shared/stores/authStore";

let bootstrapped = false;

/** Instruments shared Zustand stores once per app session (dev only). */
export function bootstrapDataCacheDebug(): void {
  if (bootstrapped) return;
  if (!__DEV__) return;

  bootstrapped = true;
  dataCacheDebug.setEnabled(true);

  const unsubscribers = [instrumentZustandStore(useAuthStore, "authStore")];

  dataCacheDebug.lifecycle("bootstrapDataCacheDebug", "Store instrumentation active", {
    stores: ["authStore"],
  });

  if (typeof globalThis !== "undefined") {
    const g = globalThis as typeof globalThis & {
      __havenDataCacheDebug?: {
        exportText: () => string;
        clear: () => void;
        getEntries: () => ReturnType<typeof dataCacheDebug.getEntries>;
      };
    };
    g.__havenDataCacheDebug = {
      exportText: () => dataCacheDebug.exportAsSortedText(),
      clear: () => dataCacheDebug.clear(),
      getEntries: () => dataCacheDebug.getEntries(),
    };
  }

  void unsubscribers;
}
