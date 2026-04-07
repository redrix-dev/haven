import { getCommunityDataBackend } from "@shared/lib/backend";
import { usePermissionsStore } from "@shared/stores/permissionsStore";

const inflightByServerId = new Map<string, Promise<void>>();

/**
 * Fetches server permissions for one community and writes into `permissionsStore`.
 * Concurrent calls for the same `serverId` share one in-flight request.
 */
export function hydrateCommunityPermissions(serverId: string): Promise<void> {
  const existing = inflightByServerId.get(serverId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const backend = getCommunityDataBackend(serverId);
      const permissions = await backend.fetchServerPermissions(serverId);
      const permissionsStore = usePermissionsStore.getState();
      permissionsStore.setPermissions(serverId, permissions);
      permissionsStore.invalidateElevatedForServer(serverId);
    } catch (error) {
      console.error("Error loading server permissions:", error);
      usePermissionsStore.getState().clearPermissions(serverId);
    } finally {
      inflightByServerId.delete(serverId);
    }
  })();

  inflightByServerId.set(serverId, promise);
  return promise;
}

export function hydrateCommunityPermissionsForMany(
  serverIds: string[],
): Promise<void> {
  return Promise.allSettled(
    serverIds.map((id) => hydrateCommunityPermissions(id)),
  ).then(() => undefined);
}
