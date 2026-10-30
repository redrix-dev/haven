import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { CommunityChannelBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  ChannelNexus,
  createInitialChannelState,
} from "@shared/nexus/channels/channelNexus";
import type { ChannelState } from "@shared/nexus/channels/channelTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared ChannelNexus: the store the hooks read. */
export class ChannelReactNexus extends ChannelNexus {
  readonly reactiveStore: ReadableStore<ChannelState>;

  constructor(
    persistence: NexusPersistence,
    communityData: CommunityChannelBackend,
  ) {
    const port = createZustandStatePort(createInitialChannelState());
    super(port, persistence, communityData);
    this.reactiveStore = port.store;
  }
}
