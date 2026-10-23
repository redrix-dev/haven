import { createMemo, type Accessor } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type { ChannelMeta } from "@shared/features/messaging/logic";
import type { MessageBundle } from "@shared/lib/backend/types";
import {
  CommunityMessageNexus,
  createInitialCommunityMessageState,
  type CommunityMessageState,
} from "@shared/nexus/messages/communityMessageNexus";
import {
  projectChannelMessagesForViewer,
  selectChannelMessages,
  selectChannelMeta,
} from "@shared/nexus/messages/communityMessageSelectors";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared CommunityMessageNexus. All logic lives in the base class. */
export class CommunityMessageSolidNexus extends CommunityMessageNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: CommunityMessageState;
  private readonly policy: ViewerMessagePolicyStore;

  constructor(
    communityId: string,
    persistence: NexusPersistence,
    viewerMessagePolicyStore: ViewerMessagePolicyStore,
  ) {
    const port = createSolidStatePort(createInitialCommunityMessageState());
    super(communityId, port, persistence, viewerMessagePolicyStore);
    this.state = port.tracked;
    this.policy = viewerMessagePolicyStore;
  }

  channelMessages(channelId: Accessor<string>): Accessor<MessageBundle[]> {
    return createMemo(() => selectChannelMessages(this.state, channelId()));
  }

  visibleChannelMessages(
    channelId: Accessor<string>,
  ): Accessor<MessageBundle[]> {
    const raw = this.channelMessages(channelId);
    // The policy proxy is read inside the memo so Solid tracks exactly the
    // fields the projection touches.
    return createMemo(() =>
      projectChannelMessagesForViewer(raw(), this.policy.getState(), {
        communityId: this.communityId,
        channelId: channelId(),
      }),
    );
  }

  channelMeta(channelId: Accessor<string>): Accessor<ChannelMeta> {
    return createMemo(() => selectChannelMeta(this.state, channelId()));
  }

  isLoadingOlder(channelId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.state.loadingOlder[channelId()] ?? false);
  }

  hasInitialLoadCompleted(channelId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.initialLoadComplete[channelId()] ?? false,
    );
  }
}
