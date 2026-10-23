import { createMemo, type Accessor } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import {
  DirectMessageNexus,
  createInitialDirectMessageState,
} from "@shared/nexus/direct-messages/directMessageNexus";
import {
  projectConversations,
  projectMessages,
  selectActiveConversationId,
  selectComposeDraftPeer,
  selectIsLoadingConversations,
  selectIsLoadingMessages,
} from "@shared/nexus/direct-messages/dmSelectors";
import type {
  DirectMessageState,
  DmComposeDraftPeer,
} from "@shared/nexus/direct-messages/dmTypes";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared DirectMessageNexus. */
export class DirectMessageSolidNexus extends DirectMessageNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: DirectMessageState;

  constructor(persistence: NexusPersistence, backend: DirectMessageBackend) {
    const port = createSolidStatePort(createInitialDirectMessageState());
    super(port, persistence, backend);
    this.state = port.tracked;
  }

  conversations(): Accessor<DirectMessageConversationSummary[]> {
    return createMemo(() => projectConversations(this.state));
  }

  conversationsLoading(): Accessor<boolean> {
    return createMemo(() => selectIsLoadingConversations(this.state));
  }

  messages(conversationId: Accessor<string>): Accessor<DirectMessage[]> {
    return createMemo(() => projectMessages(this.state, conversationId()));
  }

  messagesLoading(conversationId: Accessor<string>): Accessor<boolean> {
    return createMemo(() =>
      selectIsLoadingMessages(this.state, conversationId()),
    );
  }

  activeConversationId(): Accessor<string | null> {
    return createMemo(() => selectActiveConversationId(this.state));
  }

  composeDraftPeer(): Accessor<DmComposeDraftPeer | null> {
    return createMemo(() => selectComposeDraftPeer(this.state));
  }
}
