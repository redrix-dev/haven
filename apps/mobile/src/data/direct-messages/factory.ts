import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { DirectMessageNexus } from "./DirectMessageNexus";

export function createDirectMessageNexus(
  persistence: NexusPersistence,
  backend: DirectMessageBackend,
): DirectMessageNexus {
  return new DirectMessageNexus(persistence, backend);
}
