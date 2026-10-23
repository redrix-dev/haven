import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
import {
  DirectMessageNexus,
  createInitialDirectMessageState,
} from "@shared/nexus/direct-messages/directMessageNexus";
import type { DirectMessageState } from "@shared/nexus/direct-messages/dmTypes";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared DirectMessageNexus: the store the hooks read. */
export class DirectMessageReactNexus extends DirectMessageNexus {
  readonly reactiveStore: ReadableStore<DirectMessageState>;

  constructor(persistence: NexusPersistence, backend: DirectMessageBackend) {
    const port = createZustandStatePort(createInitialDirectMessageState());
    super(port, persistence, backend);
    this.reactiveStore = port.store;
  }
}
