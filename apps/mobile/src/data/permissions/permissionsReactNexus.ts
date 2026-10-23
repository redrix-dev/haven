import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  PermissionsNexus,
  createInitialPermissionsState,
  type PermissionsBackend,
  type PermissionsState,
} from "@shared/nexus/permissions/permissionsNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared PermissionsNexus: the store the hooks read. */
export class PermissionsReactNexus extends PermissionsNexus {
  readonly reactiveStore: ReadableStore<PermissionsState>;

  constructor(backend: PermissionsBackend) {
    const port = createZustandStatePort(createInitialPermissionsState());
    super(port, backend);
    this.reactiveStore = port.store;
  }
}
