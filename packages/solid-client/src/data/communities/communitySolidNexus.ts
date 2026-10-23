import { createMemo, type Accessor } from "solid-js";
import { applyCommunityDisplayOrder } from "@shared/core/communityDisplayOrder";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import {
  CommunityNexus,
  createInitialCommunityState,
  type CommunityControlPlane,
} from "@shared/nexus/communities/communityNexus";
import {
  projectCommunities,
  selectActiveId,
  selectDisplayOrderIds,
} from "@shared/nexus/communities/communitySelectors";
import type {
  Community,
  CommunityState,
} from "@shared/nexus/communities/communityTypes";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared CommunityNexus. */
export class CommunitySolidNexus extends CommunityNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: CommunityState;

  constructor(
    persistence: NexusPersistence,
    controlPlane: CommunityControlPlane,
  ) {
    const port = createSolidStatePort(createInitialCommunityState());
    super(port, persistence, controlPlane);
    this.state = port.tracked;
  }

  communities(): Accessor<Community[]> {
    return createMemo(() => projectCommunities(this.state));
  }

  orderedCommunities(): Accessor<Community[]> {
    return createMemo(() =>
      applyCommunityDisplayOrder(
        projectCommunities(this.state),
        selectDisplayOrderIds(this.state),
      ),
    );
  }

  /** Tracked read of the active id (call it inside a tracking scope). */
  activeCommunityId(): string | null {
    return selectActiveId(this.state);
  }

  /** True while the list is loading — lets route guards tell "not loaded yet" from "not a member". */
  isLoading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoading);
  }
}
