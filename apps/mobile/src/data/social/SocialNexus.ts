import type { ReadableStore } from "@shared/nexus/storeTypes";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import {
  SocialNexus as SharedSocialNexus,
  createInitialSocialState,
  type SocialState,
} from "@shared/nexus/social/socialNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

export type SocialNexusState = SocialState;

/** Mobile binding over the shared SocialNexus: exposes the store the React hooks read. */
export class SocialNexus extends SharedSocialNexus {
  readonly reactiveStore: ReadableStore<SocialState>;

  constructor(backend: SocialBackend) {
    const port = createZustandStatePort(createInitialSocialState());
    super(port, backend);
    this.reactiveStore = port.store;
  }
}
