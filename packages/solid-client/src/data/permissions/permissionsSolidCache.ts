import { createStore } from "solid-js/store";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ServerPermissions } from "@shared/lib/backend/types";
import { EMPTY_PERMISSIONS } from "@shared/features/permissions/logic/constants";

export type PermissionsSolidState = {
  permissionsByCommunityId: Record<string, ServerPermissions>;
  elevatedByCommunityId: Record<string, boolean>;
};

/** Solid-native permissions cache stub for typecheck:solid. */
export class PermissionsSolidCache {
  private readonly state: PermissionsSolidState;

  constructor() {
    const [state] = createStore<PermissionsSolidState>({
      permissionsByCommunityId: {},
      elevatedByCommunityId: {},
    });
    this.state = state;
  }

  getPermissions(communityId: string): ServerPermissions {
    return this.state.permissionsByCommunityId[communityId] ?? EMPTY_PERMISSIONS;
  }

  async ensureLoaded(
    _communityId: string,
    _communityBackend: CommunityDataBackend,
  ): Promise<void> {
    throw new Error("PermissionsSolidCache.ensureLoaded not implemented yet");
  }

  clear(): void {
    void this.state;
  }
}
