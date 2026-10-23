import type {
  ChannelGroup,
  ChannelKind,
  ChannelPermissionsSnapshot,
} from "@shared/lib/backend/types";
import type { EntityMapState } from "@shared/core/cache/entityTypes";

export type HavenChannel = {
  id: string;
  communityId: string;
  name: string;
  kind: ChannelKind;
  position: number;
  topic: string | null;
  createdAt: string;
};

export type ChannelState = EntityMapState<HavenChannel> & {
  byCommunity: Record<string, string[]>;
  groups: Record<string, ChannelGroup[]>;
  ungrouped: Record<string, string[]>;
  collapsed: Record<string, string[]>;
  activeChannelId: string | null;
  loadingByCommunity: Record<string, boolean>;
  /** The channel last focused in each community, restored on return. */
  lastChannelByCommunity: Record<string, string | null>;
  /** Channel permission editor: one loaded overwrite snapshot per channel. */
  permissionsByChannel: Record<string, ChannelPermissionsSnapshot>;
  permissionsLoadingByChannel: Record<string, boolean>;
  permissionsErrorsByChannel: Record<string, string | null>;
};
