import { createMemoryPersistence } from "@shared/core";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";

export function createTauriPersistence(): NexusPersistence {
  return createMemoryPersistence();
}
