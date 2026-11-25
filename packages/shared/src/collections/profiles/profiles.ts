/**
 * Profiles: people as everyone sees them (a name and an avatar), and the
 * fuller card shown when someone is opened. DATABASE.md: "People".
 *
 * Profiles are fetched as they are needed (the authors on a page, the
 * members of a community) and kept current by `profile.updated`. A card says
 * things about the viewer too (friends, shared communities), so it is
 * fetched again each time it is opened.
 */

import type { PeopleBackend } from "@shared/lib/backend/people";
import type {
  ProfileCardRecord,
  ProfileRecord,
} from "@shared/lib/backend/records";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, dropIds, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

export type ProfilesState = {
  byId: ById<ProfileRecord>;
  /** By person id. */
  cards: ById<ProfileCardRecord>;
  requests: RequestMap;
};

export const createProfilesState = (): ProfilesState => ({
  byId: {},
  cards: {},
  requests: {},
});

/** The most people one `get_profiles` call takes. */
export const PROFILE_BATCH = 200;

export type ProfilesBackendPart = Pick<
  PeopleBackend,
  "getProfiles" | "getProfileCard"
>;

export class Profiles {
  readonly requests: Requests;
  /** Asked for and not answered yet, or answered "no such person". */
  private asked = new Set<string>();

  constructor(
    private readonly port: StatePort<ProfilesState>,
    private readonly backend: ProfilesBackendPart,
  ) {
    this.requests = new Requests("profiles", port);
  }

  get(userId: string): ProfileRecord | undefined {
    return this.port.get().byId[userId];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /**
   * Fetches the people it does not hold, once each. Call it with every id a
   * screen shows; ids already held or already asked for cost nothing.
   */
  ensure(userIds: readonly string[]): Promise<void> {
    const missing = [...new Set(userIds)].filter(
      (id) => !this.get(id) && !this.asked.has(id),
    );
    if (missing.length === 0) return Promise.resolve();
    for (const id of missing) this.asked.add(id);
    missing.sort();
    return this.fetchAll(missing);
  }

  /**
   * Everyone held, again: after a reconnect, since a `profile.updated` may
   * have been missed while away.
   */
  reloadHeld(): Promise<void> {
    const held = Object.keys(this.port.get().byId).sort();
    for (const id of held) this.asked.add(id);
    return this.fetchAll(held);
  }

  /** In batches the database takes (`get_profiles` asks for at most 200). */
  private async fetchAll(ids: string[]): Promise<void> {
    const batches: Promise<void>[] = [];
    for (let at = 0; at < ids.length; at += PROFILE_BATCH) {
      batches.push(this.fetch(ids.slice(at, at + PROFILE_BATCH)));
    }
    await Promise.all(batches);
  }

  private fetch(missing: string[]): Promise<void> {
    return this.requests.refresh(`ids:${missing.join(",")}`, async (stale) => {
      try {
        const found = await this.backend.getProfiles(missing);
        if (stale()) return;
        this.port.set({ byId: putRows(this.port.get().byId, found) });
      } catch (error) {
        // A failed ask may be asked again.
        for (const id of missing) this.asked.delete(id);
        throw error;
      }
    });
  }

  /** The card for someone being opened, fresh each time. */
  loadCard(userId: string): Promise<void> {
    return this.requests.run(`card:${userId}`, async (stale) => {
      const card = await this.backend.getProfileCard(userId);
      if (stale()) return;
      // A card is a profile and more; the profile part is the newest there is.
      const { id, username, avatar_media_id, is_staff, deleted } = card;
      this.port.set({
        cards: { ...this.port.get().cards, [userId]: card },
        byId: putRows(this.port.get().byId, [
          { id, username, avatar_media_id, is_staff, deleted },
        ]),
      });
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * `profile.updated`, and the answer to anything that changes a profile
   * (the person's own changes are made through `account`).
   */
  applyProfile(profile: ProfileRecord): void {
    const card = this.port.get().cards[profile.id];
    this.port.set({
      byId: putRows(this.port.get().byId, [profile]),
      cards: card
        ? { ...this.port.get().cards, [profile.id]: { ...card, ...profile } }
        : this.port.get().cards,
    });
  }

  /** A card that is no longer open. */
  closeCard(userId: string): void {
    this.requests.forget(`card:${userId}`);
    this.port.set({ cards: dropIds(this.port.get().cards, [userId]) });
  }

  clear(): void {
    this.asked.clear();
    this.requests.clear();
    this.port.set(createProfilesState());
  }
}
