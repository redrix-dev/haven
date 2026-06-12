import { createStore } from "solid-js/store";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { CommunityMemberListItem } from "@shared/lib/backend/types";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

export type CommunityAdminSolidState = {
  membersByCommunity: Record<string, CommunityMemberListItem[]>;
  membersLoading: Record<string, boolean>;
  membersError: Record<string, string | null>;
};

const initialState = (): CommunityAdminSolidState => ({
  membersByCommunity: {},
  membersLoading: {},
  membersError: {},
});

/**
 * Community admin/governance cache. Currently covers the member list (the
 * members panel reads it); roles, invites, bans land here as their screens do
 * — mirroring mobile's CommunityAdminNexus surface as needed.
 */
export class CommunityAdminSolidCache {
  readonly state: CommunityAdminSolidState;
  readonly reactiveStore: NotifyingReadableStore<CommunityAdminSolidState>;
  private readonly setState: (
    updater: (
      state: CommunityAdminSolidState,
    ) => Partial<CommunityAdminSolidState>,
  ) => void;

  constructor(private readonly communityData: CommunityDataBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  async ensureMembersLoaded(communityId: string): Promise<void> {
    if ((this.state.membersByCommunity[communityId] ?? []).length > 0) return;
    await this.loadMembers(communityId);
  }

  async loadMembers(communityId: string): Promise<void> {
    if (this.state.membersLoading[communityId]) return;
    this.setState((s) => ({
      membersLoading: { ...s.membersLoading, [communityId]: true },
      membersError: { ...s.membersError, [communityId]: null },
    }));
    this.reactiveStore.notify();
    try {
      const members = await this.communityData.listCommunityMembers(
        communityId,
      );
      this.setState((s) => ({
        membersByCommunity: { ...s.membersByCommunity, [communityId]: members },
      }));
    } catch (error) {
      this.setState((s) => ({
        membersError: {
          ...s.membersError,
          [communityId]:
            error instanceof Error ? error.message : "Failed to load members",
        },
      }));
    } finally {
      this.setState((s) => ({
        membersLoading: { ...s.membersLoading, [communityId]: false },
      }));
      this.reactiveStore.notify();
    }
  }

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }
}
