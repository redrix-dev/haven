import { createMemo, type Accessor } from "solid-js";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  CommunityBanItem,
  CommunityMemberListItem,
  ServerInvite,
  ServerRoleManagementSnapshot,
  ServerSettingsSnapshot,
} from "@shared/lib/backend/types";
import {
  CommunityAdminNexus,
  createInitialCommunityAdminState,
  type AdminControlPlane,
} from "@shared/nexus/community-management/communityAdminNexus";
import type { CommunityAdminState } from "@shared/nexus/community-management/communityAdminTypes";
import { createSolidStatePort } from "../kit/solidStatePort";

const NO_MEMBERS: CommunityMemberListItem[] = [];
const NO_BANS: CommunityBanItem[] = [];
const NO_INVITES: ServerInvite[] = [];

/** Solid read bindings over the shared CommunityAdminNexus. Each takes the community id as an accessor. */
export class CommunityAdminSolidNexus extends CommunityAdminNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: CommunityAdminState;

  constructor(
    communityData: CommunityDataBackend,
    controlPlane: AdminControlPlane,
  ) {
    const port = createSolidStatePort(createInitialCommunityAdminState());
    super(port, communityData, controlPlane);
    this.state = port.tracked;
  }

  members(communityId: Accessor<string>): Accessor<CommunityMemberListItem[]> {
    return createMemo(
      () => this.state.membersByCommunity[communityId()] ?? NO_MEMBERS,
    );
  }

  membersLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.isLoading("members", communityId()));
  }

  bans(communityId: Accessor<string>): Accessor<CommunityBanItem[]> {
    return createMemo(
      () => this.state.bansByCommunity[communityId()] ?? NO_BANS,
    );
  }

  roleSnapshot(
    communityId: Accessor<string>,
  ): Accessor<ServerRoleManagementSnapshot | null> {
    return createMemo(() => this.state.rolesByCommunity[communityId()] ?? null);
  }

  roleManagementLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.isLoading("roles", communityId()));
  }

  serverSettings(
    communityId: Accessor<string>,
  ): Accessor<ServerSettingsSnapshot | null> {
    return createMemo(
      () => this.state.settingsByCommunity[communityId()] ?? null,
    );
  }

  serverSettingsLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.isLoading("settings", communityId()));
  }

  serverSettingsError(communityId: Accessor<string>): Accessor<string | null> {
    return createMemo(() => this.getError("settings", communityId()));
  }

  invites(communityId: Accessor<string>): Accessor<ServerInvite[]> {
    return createMemo(
      () => this.state.invitesByCommunity[communityId()] ?? NO_INVITES,
    );
  }

  invitesLoading(communityId: Accessor<string>): Accessor<boolean> {
    return createMemo(() => this.isLoading("invites", communityId()));
  }

  invitesError(communityId: Accessor<string>): Accessor<string | null> {
    return createMemo(() => this.getError("invites", communityId()));
  }
}
