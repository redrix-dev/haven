import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { CommunityNexus } from "./CommunityNexus";

export function createCommunityNexus(
  persistence: NexusPersistence,
  controlPlane: ControlPlaneBackend,
): CommunityNexus {
  return new CommunityNexus(persistence, controlPlane);
}
