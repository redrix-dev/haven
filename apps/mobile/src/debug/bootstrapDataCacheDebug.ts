import { dataCacheDebug, instrumentZustandStore } from "@shared/debug";
import { useAuthStore } from "@shared/stores/authStore";
import { useDmStore } from "@shared/stores/dmStore";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useServersStore } from "@shared/stores/serversStore";
import { useSocialStore } from "@shared/stores/socialStore";

let bootstrapped = false;

/** Instruments shared Zustand stores once per app session (dev only). */
export function bootstrapDataCacheDebug(): void {
  if (bootstrapped) return;
  if (!__DEV__) return;

  bootstrapped = true;
  dataCacheDebug.setEnabled(true);

  const unsubscribers = [
    instrumentZustandStore(useNavigationStore, "navigationStore"),
    instrumentZustandStore(useMessagesStore, "messagesStore"),
    instrumentZustandStore(useServersStore, "serversStore"),
    instrumentZustandStore(useAuthStore, "authStore"),
    instrumentZustandStore(useSocialStore, "socialStore"),
    instrumentZustandStore(useDmStore, "dmStore"),
  ];

  dataCacheDebug.lifecycle("bootstrapDataCacheDebug", "Store instrumentation active", {
    stores: [
      "navigationStore",
      "messagesStore",
      "serversStore",
      "authStore",
      "socialStore",
      "dmStore",
    ],
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
