import { createMemo, type Accessor } from "solid-js";
import type {
  ControlPlaneBackend,
  PlatformStaffInfo,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  UserFlairGrant,
  UserProfileCard,
} from "@shared/lib/backend/types";
import type { LiveProfilesRecord } from "@shared/lib/liveProfiles";
import {
  ProfileNexus,
  createInitialProfileState,
  type ProfileState,
} from "@shared/nexus/profile/profileNexus";
import { createSolidStatePort } from "../kit/solidStatePort";

/** Solid read bindings over the shared ProfileNexus. Each takes the user id as an accessor. */
export class ProfileSolidNexus extends ProfileNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: ProfileState;

  constructor(controlPlane: ControlPlaneBackend) {
    const port = createSolidStatePort(createInitialProfileState());
    super(port, controlPlane);
    this.state = port.tracked;
  }

  liveProfiles(): Accessor<LiveProfilesRecord> {
    return createMemo(() => this.state.profiles);
  }

  viewerProfile(
    userId: Accessor<string | null>,
  ): Accessor<UserProfileInfo | null> {
    return this.byUser(userId, (id) => this.state.viewerProfiles[id], null);
  }

  profileCard(
    userId: Accessor<string | null>,
  ): Accessor<UserProfileCard | null> {
    return this.byUser(userId, (id) => this.state.profileCards[id], null);
  }

  profileCardLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return this.byUser(
      userId,
      (id) => this.state.profileCardLoading[id],
      false,
    );
  }

  profileCardError(userId: Accessor<string | null>): Accessor<string | null> {
    return this.byUser(userId, (id) => this.state.profileCardErrors[id], null);
  }

  userFlairs(userId: Accessor<string | null>): Accessor<UserFlairGrant[]> {
    return this.byUser(userId, (id) => this.state.userFlairGrants[id], []);
  }

  userFlairsLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return this.byUser(
      userId,
      (id) => this.state.userFlairGrantLoading[id],
      false,
    );
  }

  userFlairsError(userId: Accessor<string | null>): Accessor<string | null> {
    return this.byUser(
      userId,
      (id) => this.state.userFlairGrantErrors[id],
      null,
    );
  }

  platformStaffInfo(
    userId: Accessor<string | null>,
  ): Accessor<PlatformStaffInfo | null> {
    return this.byUser(userId, (id) => this.state.platformStaff[id], null);
  }

  platformStaffLoading(userId: Accessor<string | null>): Accessor<boolean> {
    return this.byUser(
      userId,
      (id) => this.state.platformStaffLoading[id],
      false,
    );
  }

  platformStaffError(userId: Accessor<string | null>): Accessor<string | null> {
    return this.byUser(
      userId,
      (id) => this.state.platformStaffErrors[id],
      null,
    );
  }

  /** A memo over one user's slot of a per-user record; `empty` when no user or no value. */
  private byUser<V>(
    userId: Accessor<string | null>,
    read: (id: string) => V | null | undefined,
    empty: V,
  ): Accessor<V> {
    return createMemo(() => {
      const id = userId();
      return id ? (read(id) ?? empty) : empty;
    });
  }
}
