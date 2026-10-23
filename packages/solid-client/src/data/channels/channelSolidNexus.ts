import { createMemo, type Accessor } from "solid-js";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  ChannelGroupState,
  ChannelPermissionsSnapshot,
} from "@shared/lib/backend/types";
import {
  ChannelNexus,
  createInitialChannelState,
} from "@shared/nexus/channels/channelNexus";
import {
  projectChannelGroups,
  projectChannels,
  selectActiveChannelId,
} from "@shared/nexus/channels/channelSelectors";
import type {
  ChannelState,
  HavenChannel,
} from "@shared/nexus/channels/channelTypes";
import { createSolidStatePort } from "../kit/solidStatePort";

/**
 * Solid read bindings over the shared ChannelNexus. Each projection is a memo
 * over the live store, so Solid tracks exactly the fields it touches — a
 * channel upsert in one community never wakes a list rendering another.
 */
export class ChannelSolidNexus extends ChannelNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: ChannelState;

  constructor(
    persistence: NexusPersistence,
    communityData: CommunityDataBackend,
  ) {
    const port = createSolidStatePort(createInitialChannelState());
    super(port, persistence, communityData);
    this.state = port.tracked;
  }

  channels(communityId: Accessor<string>): Accessor<HavenChannel[]> {
    return createMemo(() => projectChannels(this.state, communityId()));
  }

  /** Tracked read of the active channel id (call inside a tracking scope). */
  activeChannelId(): string | null {
    return selectActiveChannelId(this.state);
  }

  loading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(
      () => this.state.loadingByCommunity[communityId()] ?? false,
    );
  }

  channelGroups(communityId: Accessor<string>): Accessor<ChannelGroupState> {
    return createMemo(() => projectChannelGroups(this.state, communityId()));
  }

  channelPermissions(
    channelId: Accessor<string | null>,
  ): Accessor<ChannelPermissionsSnapshot | null> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsByChannel[id] ?? null) : null;
    });
  }

  channelPermissionsLoading(
    channelId: Accessor<string | null>,
  ): Accessor<boolean> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsLoadingByChannel[id] ?? false) : false;
    });
  }

  channelPermissionsError(
    channelId: Accessor<string | null>,
  ): Accessor<string | null> {
    return createMemo(() => {
      const id = channelId();
      return id ? (this.state.permissionsErrorsByChannel[id] ?? null) : null;
    });
  }
}
