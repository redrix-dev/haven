import type { Accessor } from "solid-js";
import type { ChannelNexus } from "@shared/nexus/community/ChannelNexus";
import type { HavenChannel } from "@shared/nexus/community/ChannelNexus";
import type { ChannelGroupState } from "@shared/lib/backend/types";
import {
  channelsEqual,
  groupStateEqual,
  projectChannelGroups,
  projectChannels,
  selectActiveChannelId,
  selectChannelLoading,
} from "@shared/nexus/community/channelSelectors";
import { createStoreSelector } from "./fromStore";

/**
 * Solid bindings for ChannelNexus — the mirror of `@react-bindings/channels`.
 *
 * Same vanilla store, same shared projections + equality fns; the only
 * difference is the framework subscription primitive (`createStoreSelector`)
 * and that ids arrive as getters (`Accessor`) so Solid tracks them at access
 * time. This is the proof of approach C: one projection drives both adapters.
 */

export function createChannels(
  nexus: ChannelNexus,
  communityId: Accessor<string>,
): Accessor<HavenChannel[]> {
  return createStoreSelector(
    nexus.reactiveStore,
    (state) => projectChannels(state, communityId()),
    channelsEqual,
  );
}

export function createChannelGroups(
  nexus: ChannelNexus,
  communityId: Accessor<string>,
): Accessor<ChannelGroupState> {
  return createStoreSelector(
    nexus.reactiveStore,
    (state) => projectChannelGroups(state, communityId()),
    groupStateEqual,
  );
}

export function createActiveChannelId(
  nexus: ChannelNexus,
): Accessor<string | null> {
  return createStoreSelector(nexus.reactiveStore, selectActiveChannelId);
}

export function createChannelsLoading(
  nexus: ChannelNexus,
  communityId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, (state) =>
    selectChannelLoading(state, communityId()),
  );
}
