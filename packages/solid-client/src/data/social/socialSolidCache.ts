import { createStore } from "solid-js/store";
import { DEFAULT_SOCIAL_COUNTS } from "@shared/infrastructure/constants";
import type { SocialCounts } from "@shared/lib/backend/types";

export type SocialSolidState = {
  counts: SocialCounts;
  hiddenAuthorIds: ReadonlySet<string>;
};

/** Solid-native social cache stub for typecheck:solid. */
export class SocialSolidCache {
  private readonly state: SocialSolidState;

  constructor() {
    const [state] = createStore<SocialSolidState>({
      counts: DEFAULT_SOCIAL_COUNTS,
      hiddenAuthorIds: new Set<string>(),
    });
    this.state = state;
  }

  getHiddenAuthorIdsForViewer(): ReadonlySet<string> {
    return this.state.hiddenAuthorIds;
  }

  async ensureLoaded(): Promise<void> {
    throw new Error("SocialSolidCache.ensureLoaded not implemented yet");
  }

  clear(): void {
    void this.state;
  }
}
