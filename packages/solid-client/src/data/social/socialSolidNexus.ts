import { createMemo, type Accessor } from "solid-js";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import {
  SocialNexus,
  createInitialSocialState,
  type SocialState,
} from "@shared/nexus/social/socialNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

export type SocialSolidState = SocialState;

/** Solid read bindings over the shared SocialNexus. All logic lives in the base class. */
export class SocialSolidNexus extends SocialNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: SocialState;

  constructor(backend: SocialBackend) {
    const port = createSolidStatePort(createInitialSocialState());
    super(port, backend);
    this.state = port.tracked;
  }

  counts(): Accessor<SocialCounts> {
    return createMemo(() => this.state.counts);
  }

  friends(): Accessor<FriendSummary[]> {
    return createMemo(() => this.state.friends);
  }

  friendRequests(): Accessor<FriendRequestSummary[]> {
    return createMemo(() => this.state.requests);
  }

  blockedUsers(): Accessor<BlockedUserSummary[]> {
    return createMemo(() => this.state.blockedUsers);
  }

  loading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoading);
  }
}

export function createSocialSolidNexus(
  backend: SocialBackend,
): SocialSolidNexus {
  return new SocialSolidNexus(backend);
}
