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
import { createLoadGate, isFresh } from "../kit/loadGate";
import type { StatePort } from "../kit/statePort";

export type SocialState = {
  counts: SocialCounts;
  friends: FriendSummary[];
  requests: FriendRequestSummary[];
  blockedUsers: BlockedUserSummary[];
  /** My blocks ∪ users blocking me — the authors the viewer must not see. */
  hiddenAuthorIds: ReadonlySet<string>;
  myBlockedUserIds: string[];
  usersBlockingMeIds: string[];
  isLoading: boolean;
  lastLoadedAt: number;
};

/** Fresh objects every call: a store may morph its state in place, so never seed it with shared constants. */
export const createInitialSocialState = (): SocialState => ({
  counts: { ...DEFAULT_SOCIAL_COUNTS },
  friends: [],
  requests: [],
  blockedUsers: [],
  hiddenAuthorIds: new Set<string>(),
  myBlockedUserIds: [],
  usersBlockingMeIds: [],
  isLoading: false,
  lastLoadedAt: 0,
});

const DEFAULT_FRESHNESS_MS = 60_000;

/**
 * Friends, friend requests and block lists. Block lists drive the viewer
 * message policy: every change fires the policy-sync callback the core
 * registered, and the core pushes a new policy snapshot to the message caches.
 *
 * Social is a snapshot domain — every mutation reloads the whole summary from
 * the backend rather than patching lists locally.
 */
export class SocialNexus {
  private readonly gate = createLoadGate();
  private policySync: (() => void) | null = null;

  constructor(
    protected readonly port: StatePort<SocialState>,
    private readonly backend: SocialBackend,
  ) {}

  setPolicySyncCallback(callback: (() => void) | null): void {
    this.policySync = callback;
  }

  getHiddenAuthorIdsForViewer(): ReadonlySet<string> {
    return this.port.get().hiddenAuthorIds;
  }

  load(): Promise<void> {
    return this.gate.run("load", async (stale) => {
      this.port.set({ isLoading: true });
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
        if (stale()) return;
        this.port.set({
          counts,
          friends,
          requests,
          blockedUsers,
          lastLoadedAt: Date.now(),
        });
        this.setBlockLists(myBlockedUserIds, usersBlockingMeIds);
      } finally {
        this.port.set({ isLoading: false });
      }
    });
  }

  ensureLoaded(options?: { freshnessMs?: number }): Promise<void> {
    if (this.gate.isRunning("load")) return this.load();
    const freshnessMs = options?.freshnessMs ?? DEFAULT_FRESHNESS_MS;
    if (isFresh(this.port.get().lastLoadedAt, freshnessMs)) {
      return Promise.resolve();
    }
    return this.load();
  }

  handleSocialChange(_payload: Record<string, unknown>): void {
    void this.load().catch((err) => {
      console.warn("[SocialNexus] reload after SOCIAL_CHANGE failed", err);
    });
  }

  async blockUser(targetUserId: string): Promise<void> {
    await this.backend.blockUser(targetUserId);
    // Hide the author immediately; the reload below confirms it.
    const { myBlockedUserIds, usersBlockingMeIds } = this.port.get();
    this.setBlockLists([...myBlockedUserIds, targetUserId], usersBlockingMeIds);
    await this.load();
  }

  async unblockUser(targetUserId: string): Promise<void> {
    await this.backend.unblockUser(targetUserId);
    const { myBlockedUserIds, usersBlockingMeIds } = this.port.get();
    this.setBlockLists(
      myBlockedUserIds.filter((id) => id !== targetUserId),
      usersBlockingMeIds,
    );
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

  searchUsers(query: string): Promise<FriendSearchResult[]> {
    return this.backend.searchUsersForFriendAdd(query);
  }

  clear(): void {
    this.gate.clear();
    this.port.set(createInitialSocialState());
  }

  private setBlockLists(
    myBlocked: readonly string[],
    blockingMe: readonly string[],
  ): void {
    const myBlockedUserIds = normalizeUserIds([...myBlocked]);
    const usersBlockingMeIds = normalizeUserIds([...blockingMe]);
    this.port.set({
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
