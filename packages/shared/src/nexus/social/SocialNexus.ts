import { create } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import type { StoreApi, UseBoundStore } from "zustand";

const EMPTY_FRIENDS: FriendSummary[] = [];
const EMPTY_REQUESTS: FriendRequestSummary[] = [];
const EMPTY_BLOCKED: BlockedUserSummary[] = [];

export type SocialNexusState = {
  myBlockedUserIds: string[];
  usersBlockingMeIds: string[];
  hiddenAuthorIds: ReadonlySet<string>;
  counts: SocialCounts;
  friends: FriendSummary[];
  requests: FriendRequestSummary[];
  blockedUsers: BlockedUserSummary[];
  isLoading: boolean;
  revision: number;
};

const normalizeUserIds = (userIds: ReadonlyArray<string>): string[] =>
  Array.from(new Set(userIds.filter((userId) => userId.length > 0)));

const unionHiddenAuthorIds = (
  myBlockedUserIds: readonly string[],
  usersBlockingMeIds: readonly string[],
): ReadonlySet<string> =>
  new Set([...myBlockedUserIds, ...usersBlockingMeIds]);

const friendsEqual = (a: FriendSummary[], b: FriendSummary[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].friendUserId !== b[i].friendUserId) return false;
  }
  return true;
};

const requestsEqual = (
  a: FriendRequestSummary[],
  b: FriendRequestSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].requestId !== b[i].requestId) return false;
  }
  return true;
};

const blockedEqual = (
  a: BlockedUserSummary[],
  b: BlockedUserSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].blockedUserId !== b[i].blockedUserId) return false;
  }
  return true;
};

export class SocialNexus {
  private backend: SocialBackend | null = null;
  private policySync: (() => void) | null = null;
  private loadInflight: Promise<void> | null = null;
  private blockListsInflight: Promise<void> | null = null;

  private friendsSnapshot = EMPTY_FRIENDS;
  private requestsSnapshot = EMPTY_REQUESTS;
  private blockedSnapshot = EMPTY_BLOCKED;

  private readonly store: UseBoundStore<StoreApi<SocialNexusState>>;

  constructor(_persistence: NexusPersistence) {
    void _persistence;
    this.store = create<SocialNexusState>()(() => ({
      myBlockedUserIds: [],
      usersBlockingMeIds: [],
      hiddenAuthorIds: new Set<string>(),
      counts: DEFAULT_SOCIAL_COUNTS,
      friends: EMPTY_FRIENDS,
      requests: EMPTY_REQUESTS,
      blockedUsers: EMPTY_BLOCKED,
      isLoading: false,
      revision: 0,
    }));
  }

  setBackend(backend: SocialBackend): void {
    this.backend = backend;
  }

  setPolicySyncCallback(callback: (() => void) | null): void {
    this.policySync = callback;
  }

  private bumpRevision(): void {
    this.store.setState((state) => ({ revision: state.revision + 1 }));
  }

  private syncPolicy(): void {
    this.policySync?.();
  }

  private setBlockLists(input: {
    myBlockedUserIds: string[];
    usersBlockingMeIds: string[];
  }): void {
    const myBlockedUserIds = normalizeUserIds(input.myBlockedUserIds);
    const usersBlockingMeIds = normalizeUserIds(input.usersBlockingMeIds);
    this.store.setState({
      myBlockedUserIds,
      usersBlockingMeIds,
      hiddenAuthorIds: unionHiddenAuthorIds(
        myBlockedUserIds,
        usersBlockingMeIds,
      ),
    });
    this.bumpRevision();
    this.syncPolicy();
  }

  getHiddenAuthorIdsForViewer(): ReadonlySet<string> {
    return this.store.getState().hiddenAuthorIds;
  }

  async load(): Promise<void> {
    if (this.loadInflight) return this.loadInflight;
    if (!this.backend) {
      throw new Error("SocialNexus.load called before backend attached.");
    }

    this.store.setState({ isLoading: true });
    const promise = (async () => {
      const [
        counts,
        myBlockedUserIds,
        usersBlockingMeIds,
        friends,
        requests,
        blockedUsers,
      ] = await Promise.all([
        this.backend!.getSocialCounts(),
        this.backend!.listMyBlocks(),
        this.backend!.listUsersBlockingMe(),
        this.backend!.listFriends(),
        this.backend!.listFriendRequests(),
        this.backend!.listBlockedUsers(),
      ]);

      this.store.setState({
        counts,
        friends,
        requests,
        blockedUsers,
        isLoading: false,
      });
      this.setBlockLists({ myBlockedUserIds, usersBlockingMeIds });
    })().finally(() => {
      this.loadInflight = null;
    });

    this.loadInflight = promise;
    return promise;
  }

  async loadBlockLists(): Promise<void> {
    if (this.blockListsInflight) return this.blockListsInflight;
    if (!this.backend) {
      throw new Error(
        "SocialNexus.loadBlockLists called before backend attached.",
      );
    }

    const promise = (async () => {
      const [myBlockedUserIds, usersBlockingMeIds] = await Promise.all([
        this.backend!.listMyBlocks(),
        this.backend!.listUsersBlockingMe(),
      ]);
      this.setBlockLists({ myBlockedUserIds, usersBlockingMeIds });
    })().finally(() => {
      this.blockListsInflight = null;
    });

    this.blockListsInflight = promise;
    return promise;
  }

  handleSocialChange(payload: Record<string, unknown>): void {
    void this.load().catch((err) => {
      console.warn("[SocialNexus] reload after SOCIAL_CHANGE failed", err);
    });
    void payload;
  }

  async blockUser(targetUserId: string): Promise<void> {
    if (!this.backend) {
      throw new Error("SocialNexus.blockUser called before backend attached.");
    }
    await this.backend.blockUser(targetUserId);
    const state = this.store.getState();
    this.setBlockLists({
      myBlockedUserIds: normalizeUserIds([
        ...state.myBlockedUserIds,
        targetUserId,
      ]),
      usersBlockingMeIds: state.usersBlockingMeIds,
    });
  }

  async unblockUser(targetUserId: string): Promise<void> {
    if (!this.backend) {
      throw new Error(
        "SocialNexus.unblockUser called before backend attached.",
      );
    }
    await this.backend.unblockUser(targetUserId);
    const state = this.store.getState();
    this.setBlockLists({
      myBlockedUserIds: state.myBlockedUserIds.filter(
        (id) => id !== targetUserId,
      ),
      usersBlockingMeIds: state.usersBlockingMeIds,
    });
  }

  async sendFriendRequest(username: string): Promise<string> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    const requestId = await this.backend.sendFriendRequest(username);
    void this.load();
    return requestId;
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.acceptFriendRequest(requestId);
    void this.load();
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.declineFriendRequest(requestId);
    void this.load();
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.cancelFriendRequest(requestId);
    void this.load();
  }

  async removeFriend(otherUserId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.removeFriend(otherUserId);
    void this.load();
  }

  useCounts(): SocialCounts {
    return useStoreWithEqualityFn(this.store, (state) => state.counts);
  }

  useFriends(): FriendSummary[] {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        void state.revision;
        if (friendsEqual(this.friendsSnapshot, state.friends)) {
          return this.friendsSnapshot;
        }
        this.friendsSnapshot = state.friends;
        return state.friends;
      },
      friendsEqual,
    );
  }

  useRequests(): FriendRequestSummary[] {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        void state.revision;
        if (requestsEqual(this.requestsSnapshot, state.requests)) {
          return this.requestsSnapshot;
        }
        this.requestsSnapshot = state.requests;
        return state.requests;
      },
      requestsEqual,
    );
  }

  useBlockedUsers(): BlockedUserSummary[] {
    return useStoreWithEqualityFn(
      this.store,
      (state) => {
        void state.revision;
        if (blockedEqual(this.blockedSnapshot, state.blockedUsers)) {
          return this.blockedSnapshot;
        }
        this.blockedSnapshot = state.blockedUsers;
        return state.blockedUsers;
      },
      blockedEqual,
    );
  }

  useBlockedUserIds(): ReadonlySet<string> {
    return useStoreWithEqualityFn(
      this.store,
      (state) => state.hiddenAuthorIds,
      (a, b) => {
        if (a === b) return true;
        if (a.size !== b.size) return false;
        for (const id of a) {
          if (!b.has(id)) return false;
        }
        return true;
      },
    );
  }

  useIsLoading(): boolean {
    return useStoreWithEqualityFn(this.store, (state) => state.isLoading);
  }

  rehydrate(): void {}

  clear(): void {
    this.store.setState({
      myBlockedUserIds: [],
      usersBlockingMeIds: [],
      hiddenAuthorIds: new Set<string>(),
      counts: DEFAULT_SOCIAL_COUNTS,
      friends: EMPTY_FRIENDS,
      requests: EMPTY_REQUESTS,
      blockedUsers: EMPTY_BLOCKED,
      isLoading: false,
      revision: 0,
    });
    this.friendsSnapshot = EMPTY_FRIENDS;
    this.requestsSnapshot = EMPTY_REQUESTS;
    this.blockedSnapshot = EMPTY_BLOCKED;
  }
}
