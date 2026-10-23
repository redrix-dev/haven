import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  CommunityAdminNexus,
  createInitialCommunityAdminState,
  type AdminControlPlane,
} from "@shared/nexus/community-management/communityAdminNexus";
import type { CommunityAdminState } from "@shared/nexus/community-management/communityAdminTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared CommunityAdminNexus: the store the hooks read. */
export class CommunityAdminReactNexus extends CommunityAdminNexus {
  readonly reactiveStore: ReadableStore<CommunityAdminState>;

  constructor(
    communityData: CommunityDataBackend,
    controlPlane: AdminControlPlane,
  ) {
    const port = createZustandStatePort(createInitialCommunityAdminState());
    super(port, communityData, controlPlane);
    this.reactiveStore = port.store;
  }
}
