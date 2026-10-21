import type { StoreApi } from "zustand/vanilla";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type {
  ChannelMeta,
  SendCommunityMessageMediaOptions,
} from "@shared/features/messaging/logic";
import type { MessageBundle } from "@shared/lib/backend/types";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
  type CommunityMessageState,
} from "@shared/nexus/community/communityMessageNexus";
import {
  selectChannelMessages,
  selectChannelMeta,
} from "@shared/nexus/community/communityMessageSelectors";
import { createZustandStatePort } from "../kit/zustandStatePort";

export type { ChannelMeta, SendCommunityMessageMediaOptions };
export type CommunityMessageStoreState = CommunityMessageState;

/** Mobile binding over the shared CommunityMessageNexus: the store and selectors the React hooks read. */
export class CommunityMessageCache extends CommunityMessageNexus {
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

  getReactiveStore(): StoreApi<CommunityMessageState> {
    return this.reactiveStore;
  }

  getChannelStateSelector(
    channelId: string,
  ): (state: CommunityMessageState) => MessageBundle[] {
    return (state) => selectChannelMessages(state, channelId);
  }

  getChannelMetaSelector(
    channelId: string,
  ): (state: CommunityMessageState) => ChannelMeta {
    return (state) => selectChannelMeta(state, channelId);
  }
}
