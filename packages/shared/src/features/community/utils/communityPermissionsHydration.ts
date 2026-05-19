import { requireHavenCore } from "@shared/core";
import { getCommunityDataBackend } from "@shared/lib/backend";

/**
 * Fetches server permissions for one community via PermissionsNexus.
 * Concurrent calls for the same `serverId` share one in-flight request.
 */
export function hydrateCommunityPermissions(serverId: string): Promise<void> {
  const core = requireHavenCore();
  return core.permissions.ensureLoaded(
    serverId,
    getCommunityDataBackend(serverId),
  );
}

export function hydrateCommunityPermissionsForMany(
  serverIds: string[],
): Promise<void> {
  return Promise.allSettled(
    serverIds.map((id) => hydrateCommunityPermissions(id)),
  ).then(() => undefined);
}
