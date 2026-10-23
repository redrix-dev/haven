import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  CommunityNexus,
  createInitialCommunityState,
  type CommunityControlPlane,
} from "@shared/nexus/communities/communityNexus";
import type { CommunityState } from "@shared/nexus/communities/communityTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared CommunityNexus: the store the hooks read. */
export class CommunityReactNexus extends CommunityNexus {
  readonly reactiveStore: ReadableStore<CommunityState>;

  constructor(
    persistence: NexusPersistence,
    controlPlane: CommunityControlPlane,
  ) {
    const port = createZustandStatePort(createInitialCommunityState());
    super(port, persistence, controlPlane);
    this.reactiveStore = port.store;
  }
}
