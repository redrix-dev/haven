import type { ReadableStore } from "@shared/nexus/storeTypes";
import type { ServerModmailBackend } from "@shared/lib/backend/serverModmailBackend";
import {
  CommunityModerationNexus,
  createInitialCommunityModerationState,
  type CommunityModerationState,
} from "@shared/nexus/community-management/communityModerationNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared CommunityModerationNexus: the store the hooks read. */
export class CommunityModerationReactNexus extends CommunityModerationNexus {
  readonly reactiveStore: ReadableStore<CommunityModerationState>;

  constructor(backend: ServerModmailBackend) {
    const port = createZustandStatePort(
      createInitialCommunityModerationState(),
    );
    super(port, backend);
    this.reactiveStore = port.store;
  }
}
