import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import {
  SocialNexus,
  createInitialSocialState,
  type SocialState,
} from "@shared/nexus/social/socialNexus";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared SocialNexus: the store the hooks read. */
export class SocialReactNexus extends SocialNexus {
  readonly reactiveStore: ReadableStore<SocialState>;

  constructor(backend: SocialBackend) {
    const port = createZustandStatePort(createInitialSocialState());
    super(port, backend);
    this.reactiveStore = port.store;
  }
}
