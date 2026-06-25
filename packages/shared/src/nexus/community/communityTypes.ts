import type { NexusEntry, NexusState } from "@shared/core/cache/entityTypes";

export type Community = {
  id: string;
  name: string;
  createdAt: string;
};

export type CommunityNexusState = NexusState<Community> & {
  orderedIds: string[];
  activeId: string | null;
  isLoading: boolean;
  loadError: string | null;
  displayOrderIds: string[] | null;
};

export type { NexusEntry };
