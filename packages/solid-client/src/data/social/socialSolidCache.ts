import { createStore } from "solid-js/store";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import type { SocialBackend } from "@shared/lib/backend/socialBackend";
import type { SocialCounts } from "@shared/lib/backend/types";
import { normalizeUserIds, unionHiddenAuthorIds } from "@shared/features/social/logic";
import {
  wireSolidReadableStore,
  type NotifyingReadableStore,
} from "../solidReadableStore";

export type SocialSolidState = {
  counts: SocialCounts;
  hiddenAuthorIds: ReadonlySet<string>;
  myBlockedUserIds: string[];
  usersBlockingMeIds: string[];
  isLoading: boolean;
  lastLoadedAt: number;
  revision: number;
};

/** Solid-native social cache — block lists drive viewer message policy. */
export class SocialSolidCache {
  readonly state: SocialSolidState;
  readonly reactiveStore: NotifyingReadableStore<SocialSolidState>;
  private readonly setState: (
    updater: (
      state: SocialSolidState,
    ) => Partial<SocialSolidState> | SocialSolidState,
  ) => void;
  private loadInflight: Promise<void> | null = null;
  private policySync: (() => void) | null = null;

  constructor(private readonly backend: SocialBackend) {
    const [state, setState] = createStore<SocialSolidState>({
      counts: DEFAULT_SOCIAL_COUNTS,
      hiddenAuthorIds: new Set<string>(),
      myBlockedUserIds: [],
      usersBlockingMeIds: [],
      isLoading: false,
      lastLoadedAt: 0,
      revision: 0,
    });
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setPolicySyncCallback(callback: (() => void) | null): void {
    this.policySync = callback;
  }

  getHiddenAuthorIdsForViewer(): ReadonlySet<string> {
    return this.state.hiddenAuthorIds;
  }

  async load(): Promise<void> {
    if (this.loadInflight) return this.loadInflight;

    this.setState((s) => ({ isLoading: true, revision: s.revision }));
    const promise = (async () => {
      try {
        const [
          counts,
          myBlockedUserIds,
          usersBlockingMeIds,
        ] = await Promise.all([
          this.backend.getSocialCounts(),
          this.backend.listMyBlocks(),
          this.backend.listUsersBlockingMe(),
        ]);
        this.setBlockLists({ myBlockedUserIds, usersBlockingMeIds });
        this.setState((s) => ({
          counts,
          lastLoadedAt: Date.now(),
          isLoading: false,
          revision: s.revision + 1,
        }));
        this.reactiveStore.notify();
      } catch (error) {
        this.setState((s) => ({ isLoading: false, revision: s.revision + 1 }));
        this.reactiveStore.notify();
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
      console.warn("[SocialSolidCache] reload after SOCIAL_CHANGE failed", err);
    });
  }

  clear(): void {
    this.setState(() => ({
      counts: DEFAULT_SOCIAL_COUNTS,
      hiddenAuthorIds: new Set<string>(),
      myBlockedUserIds: [],
      usersBlockingMeIds: [],
      isLoading: false,
      lastLoadedAt: 0,
      revision: 0,
    }));
    this.reactiveStore.notify();
  }

  private setBlockLists(input: {
    myBlockedUserIds: string[];
    usersBlockingMeIds: string[];
  }): void {
    const myBlockedUserIds = normalizeUserIds(input.myBlockedUserIds);
    const usersBlockingMeIds = normalizeUserIds(input.usersBlockingMeIds);
    this.setState((s) => ({
      myBlockedUserIds,
      usersBlockingMeIds,
      hiddenAuthorIds: unionHiddenAuthorIds(
        myBlockedUserIds,
        usersBlockingMeIds,
      ),
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
    this.policySync?.();
  }
}

export function createSocialSolidCache(backend: SocialBackend): SocialSolidCache {
  return new SocialSolidCache(backend);
}
