import type {
  EntityMapState,
  NexusEntry,
} from "@shared/core/cache/entityTypes";

export type Community = {
  id: string;
  name: string;
  createdAt: string;
};

export type CommunityState = EntityMapState<Community> & {
  orderedIds: string[];
  activeId: string | null;
  isLoading: boolean;
  loadError: string | null;
  displayOrderIds: string[] | null;
};

export type { NexusEntry };
