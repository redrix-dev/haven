import type { ChannelReactNexus as ChannelNexus } from "../channels/channelReactNexus";
import type { HavenChannel } from "@shared/nexus/channels/channelTypes";
import { shallow } from "zustand/shallow";
import type {
  ChannelGroupState,
  ChannelRolePermissionItem,
} from "@shared/lib/backend/types";
import {
  channelsEqual,
  groupStateEqual,
  projectChannelGroups,
  projectChannels,
  selectActiveChannelId,
  selectChannelLoading,
} from "@shared/nexus/channels/channelSelectors";
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

const NO_ROLE_PERMISSIONS: ChannelRolePermissionItem[] = [];

/** The channel permission editor's role rows for one channel, and whether they are loading. */
export function useChannelPermissionsState(
  nexus: ChannelNexus,
  channelId: string,
): {
  channelRolePermissions: ChannelRolePermissionItem[];
  channelPermissionsLoading: boolean;
} {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => ({
      channelRolePermissions:
        state.permissionsByChannel[channelId]?.rolePermissions ??
        NO_ROLE_PERMISSIONS,
      channelPermissionsLoading:
        state.permissionsLoadingByChannel[channelId] ?? false,
    }),
    shallow,
  );
}
