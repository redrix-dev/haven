import { create } from "zustand";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from "@shared/lib/backend/types";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import {
  normalizeUserIds,
  unionHiddenAuthorIds,
} from "@shared/features/social/logic";
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
  lastLoadedAt: number;
  revision: number;
};

export class SocialNexus {
  private readonly backend: SocialBackend;
  private policySync: (() => void) | null = null;
  private loadInflight: Promise<void> | null = null;
  private blockListsInflight: Promise<void> | null = null;

  private readonly store: UseBoundStore<StoreApi<SocialNexusState>>;

  get reactiveStore(): ReadableStore<SocialNexusState> {
    return this.store;
  }

  constructor(_persistence: NexusPersistence, backend: SocialBackend) {
    void _persistence;
    this.backend = backend;
    this.store = create<SocialNexusState>()(() => ({
      myBlockedUserIds: [],
      usersBlockingMeIds: [],
      hiddenAuthorIds: new Set<string>(),
      counts: DEFAULT_SOCIAL_COUNTS,
      friends: EMPTY_FRIENDS,
      requests: EMPTY_REQUESTS,
      blockedUsers: EMPTY_BLOCKED,
      isLoading: false,
      lastLoadedAt: 0,
      revision: 0,
    }));
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
      try {
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
          lastLoadedAt: Date.now(),
        });
        this.setBlockLists({ myBlockedUserIds, usersBlockingMeIds });
      } finally {
        this.store.setState({ isLoading: false });
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
    const lastLoadedAt = this.store.getState().lastLoadedAt;
    if (lastLoadedAt > 0 && Date.now() - lastLoadedAt < freshnessMs) return;
    await this.load();
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
    await this.load();
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
    await this.load();
  }

  async sendFriendRequest(username: string): Promise<string> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    const requestId = await this.backend.sendFriendRequest(username);
    await this.load();
    return requestId;
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.acceptFriendRequest(requestId);
    await this.load();
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.declineFriendRequest(requestId);
    await this.load();
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.cancelFriendRequest(requestId);
    await this.load();
  }

  async removeFriend(otherUserId: string): Promise<void> {
    if (!this.backend) throw new Error("SocialNexus backend not attached.");
    await this.backend.removeFriend(otherUserId);
    await this.load();
  }

  async searchUsers(query: string): Promise<FriendSearchResult[]> {
    return this.backend.searchUsersForFriendAdd(query);
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
      lastLoadedAt: 0,
      revision: 0,
    });
  }
}
