import type { Accessor } from "solid-js";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import {
  channelsEqual,
  projectChannels,
  selectActiveChannelId,
} from "@shared/nexus/community/channelSelectors";
import { createStoreSelector } from "../fromStore";
import type { ChannelSolidCache } from "./channelSolidCache";

export function createChannels(
  cache: ChannelSolidCache,
  communityId: Accessor<string>,
): Accessor<HavenChannel[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => projectChannels(state, communityId()),
    channelsEqual,
  );
}

export function createActiveChannelId(
  cache: ChannelSolidCache,
): Accessor<string | null> {
  return createStoreSelector(cache.reactiveStore, selectActiveChannelId);
}
