import type { ChannelNexus } from "../channels/ChannelNexus";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import type { ChannelGroupState } from "@shared/lib/backend/types";
import {
  channelsEqual,
  groupStateEqual,
  projectChannelGroups,
  projectChannels,
  selectActiveChannelId,
  selectChannelLoading,
} from "@shared/nexus/community/channelSelectors";
import { useStoreSelector } from "./useStoreSelector";

export function useChannels(
  nexus: ChannelNexus,
  communityId: string,
): HavenChannel[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => projectChannels(state, communityId),
    channelsEqual,
  );
}

export function useChannelGroups(
  nexus: ChannelNexus,
  communityId: string,
): ChannelGroupState {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => projectChannelGroups(state, communityId),
    groupStateEqual,
  );
}

export function useActiveChannelId(nexus: ChannelNexus): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveChannelId);
}

export function useChannelsLoading(
  nexus: ChannelNexus,
  communityId: string,
): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    selectChannelLoading(state, communityId),
  );
}
