import type { StoreApi } from "zustand/vanilla";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
  type CommunityMessageState,
} from "@shared/nexus/messages/communityMessageNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared CommunityMessageNexus: the store the hooks read. */
export class CommunityMessageReactNexus extends CommunityMessageNexus {
  readonly reactiveStore: StoreApi<CommunityMessageState>;

  constructor(
    communityId: string,
    persistence: NexusPersistence,
    viewerMessagePolicyStore: ViewerMessagePolicyStore | null = null,
  ) {
    const port = createZustandStatePort(createInitialCommunityMessageState());
    super(communityId, port, persistence, viewerMessagePolicyStore);
    this.reactiveStore = port.store;
  }
}
