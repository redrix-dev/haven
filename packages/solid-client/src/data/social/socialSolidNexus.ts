import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import {
  normalizeUserIds,
  unionHiddenAuthorIds,
} from "@shared/features/social/logic";

export type SocialSolidState = {
  counts: SocialCounts;
  friends: FriendSummary[];
  requests: FriendRequestSummary[];
  blockedUsers: BlockedUserSummary[];
  hiddenAuthorIds: ReadonlySet<string>;
  myBlockedUserIds: string[];
  usersBlockingMeIds: string[];
  isLoading: boolean;
  lastLoadedAt: number;
};

const initialState = (): SocialSolidState => ({
  counts: DEFAULT_SOCIAL_COUNTS,
  friends: [],
  requests: [],
  blockedUsers: [],
  hiddenAuthorIds: new Set<string>(),
  myBlockedUserIds: [],
  usersBlockingMeIds: [],
  isLoading: false,
  lastLoadedAt: 0,
});

/** Solid-native social nexus — block lists drive viewer message policy. */
export class SocialSolidNexus {
  readonly state: SocialSolidState;
  private readonly setState: SetStoreFunction<SocialSolidState>;
  private loadInflight: Promise<void> | null = null;
  private policySync: (() => void) | null = null;

  constructor(private readonly backend: SocialBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  counts(): Accessor<SocialCounts> {
    return createMemo(() => this.state.counts);
  }

  friends(): Accessor<FriendSummary[]> {
    return createMemo(() => this.state.friends);
  }

  friendRequests(): Accessor<FriendRequestSummary[]> {
    return createMemo(() => this.state.requests);
  }

  blockedUsers(): Accessor<BlockedUserSummary[]> {
    return createMemo(() => this.state.blockedUsers);
  }

  loading(): Accessor<boolean> {
    return createMemo(() => this.state.isLoading);
  }

  setPolicySyncCallback(callback: (() => void) | null): void {
    this.policySync = callback;
  }

  getHiddenAuthorIdsForViewer(): ReadonlySet<string> {
    return this.state.hiddenAuthorIds;
  }

  async load(): Promise<void> {
    if (this.loadInflight) return this.loadInflight;

    this.setState("isLoading", true);
    const promise = (async () => {
      try {
        const [
          counts,
          myBlockedUserIds,
          usersBlockingMeIds,
          friends,
          requests,
          blockedUsers,
        ] = await Promise.all([
          this.backend.getSocialCounts(),
          this.backend.listMyBlocks(),
          this.backend.listUsersBlockingMe(),
          this.backend.listFriends(),
          this.backend.listFriendRequests(),
          this.backend.listBlockedUsers(),
        ]);
        this.setBlockLists({ myBlockedUserIds, usersBlockingMeIds });
        this.setState({
          counts,
          friends,
          requests,
          blockedUsers,
          lastLoadedAt: Date.now(),
          isLoading: false,
        });
      } catch (error) {
        this.setState("isLoading", false);
        throw error;
      }
    })().finally(() => {
      this.loadInflight = null;
    });

    this.loadInflight = promise;
    return promise;
  }

  async ensureLoaded(options?: { freshnessMs?: number }): Promise<void> {
    if (this.loadInflight) return this.loadInflight;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    if (
      this.state.lastLoadedAt > 0 &&
      Date.now() - this.state.lastLoadedAt < freshnessMs
    ) {
      return;
    }
    await this.load();
  }

  handleSocialChange(_payload: Record<string, unknown>): void {
    void this.load().catch((err) => {
      console.warn("[SocialSolidNexus] reload after SOCIAL_CHANGE failed", err);
    });
  }

  async blockUser(targetUserId: string): Promise<void> {
    await this.backend.blockUser(targetUserId);
    this.setBlockLists({
      myBlockedUserIds: normalizeUserIds([
        ...this.state.myBlockedUserIds,
        targetUserId,
      ]),
      usersBlockingMeIds: this.state.usersBlockingMeIds,
    });
    await this.load();
  }

  async unblockUser(targetUserId: string): Promise<void> {
    await this.backend.unblockUser(targetUserId);
    this.setBlockLists({
      myBlockedUserIds: this.state.myBlockedUserIds.filter(
        (id) => id !== targetUserId,
      ),
      usersBlockingMeIds: this.state.usersBlockingMeIds,
    });
    await this.load();
  }

  async sendFriendRequest(username: string): Promise<string> {
    const requestId = await this.backend.sendFriendRequest(username);
    await this.load();
    return requestId;
  }

  async acceptFriendRequest(requestId: string): Promise<string> {
    const otherUserId = await this.backend.acceptFriendRequest(requestId);
    await this.load();
    return otherUserId;
  }

  async declineFriendRequest(requestId: string): Promise<boolean> {
    const ok = await this.backend.declineFriendRequest(requestId);
    await this.load();
    return ok;
  }

  async cancelFriendRequest(requestId: string): Promise<boolean> {
    const ok = await this.backend.cancelFriendRequest(requestId);
    await this.load();
    return ok;
  }

  async removeFriend(otherUserId: string): Promise<boolean> {
    const ok = await this.backend.removeFriend(otherUserId);
    await this.load();
    return ok;
  }

  async searchUsers(query: string): Promise<FriendSearchResult[]> {
    return this.backend.searchUsersForFriendAdd(query);
  }

  clear(): void {
    this.loadInflight = null;
    this.setState(initialState());
  }

  private setBlockLists(input: {
    myBlockedUserIds: string[];
    usersBlockingMeIds: string[];
  }): void {
    const myBlockedUserIds = normalizeUserIds(input.myBlockedUserIds);
    const usersBlockingMeIds = normalizeUserIds(input.usersBlockingMeIds);
    this.setState({
      myBlockedUserIds,
      usersBlockingMeIds,
      hiddenAuthorIds: unionHiddenAuthorIds(
        myBlockedUserIds,
        usersBlockingMeIds,
      ),
    });
    this.policySync?.();
  }
}

export function createSocialSolidNexus(
  backend: SocialBackend,
): SocialSolidNexus {
  return new SocialSolidNexus(backend);
}
