import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { ChannelNexus } from "./ChannelNexus";

export function createChannelNexus(
  persistence: NexusPersistence,
  communityData: CommunityDataBackend,
): ChannelNexus {
  return new ChannelNexus(persistence, communityData);
}
