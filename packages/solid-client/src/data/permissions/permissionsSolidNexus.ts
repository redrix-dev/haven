import {
  PermissionsNexus,
  createInitialPermissionsState,
  type PermissionsBackend,
  type PermissionsState,
} from "@shared/nexus/permissions/permissionsNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

/**
 * Solid binding over the shared PermissionsNexus. Its getters read the live
 * store, so calling them inside a tracking scope is reactive.
 */
export class PermissionsSolidNexus extends PermissionsNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: PermissionsState;

  constructor(backend: PermissionsBackend) {
    const port = createSolidStatePort(createInitialPermissionsState());
    super(port, backend);
    this.state = port.tracked;
  }
}
