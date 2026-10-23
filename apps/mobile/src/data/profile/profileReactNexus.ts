import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  ProfileNexus,
  createInitialProfileState,
  type ProfileState,
} from "@shared/nexus/profile/profileNexus";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared ProfileNexus: the store the hooks read. */
export class ProfileReactNexus extends ProfileNexus {
  readonly reactiveStore: ReadableStore<ProfileState>;

  constructor(controlPlane: ControlPlaneBackend) {
    const port = createZustandStatePort(createInitialProfileState());
    super(port, controlPlane);
    this.reactiveStore = port.store;
  }
}
