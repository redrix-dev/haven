/**
 * Session: what the person is doing, on this device. Where they are (a
 * community and its channel, a conversation, or neither), the channel they
 * last had open in each community, and what they have typed and not sent.
 * Nothing here comes from the database.
 *
 * Kept on the device (`sessionCopy`), so the app opens where it was left
 * with the words still in the box. A draft is the person's own unsent text,
 * which no moderator can remove; attachments are not kept, since an upload
 * slot does not outlive the session that made it.
 *
 * What the person can see changes underneath this: HavenCore calls
 * `forgetCommunity` and `forgetChannel` when a community is left or a
 * channel goes, and nothing here points at it afterwards.
 *
 * Screen state (which dialog is open, which tab) is the platform's; it is
 * not shared and not kept.
 */

import type { DeviceCopy } from "../kit/deviceCopies";
import type { StatePort } from "../kit/statePort";

export type Place =
  | {
      readonly kind: "community";
      readonly community_id: string;
      /** Null: the community, no channel picked yet. */
      readonly channel_id: string | null;
    }
  | { readonly kind: "conversation"; readonly channel_id: string };

export type ComposerDraft = {
  readonly body: string;
  readonly reply_to_id: string | null;
};

export type SessionState = {
  /** Null: home, nothing open. */
  place: Place | null;
  /** By community id: the channel open there last. */
  lastChannel: Readonly<Record<string, string>>;
  /** By channel id. Only non-empty drafts are held. */
  drafts: Readonly<Record<string, ComposerDraft>>;
};

export const createSessionState = (): SessionState => ({
  place: null,
  lastChannel: {},
  drafts: {},
});

/** The database's limit on a message, so a kept draft can be sent. */
export const DRAFT_LIMIT = 4000;

const isRecordOf = (
  value: unknown,
  test: (entry: unknown) => boolean,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(test);

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isPlace = (value: unknown): value is Place => {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const place = value as Record<string, unknown>;
  if (place.kind === "conversation") return isId(place.channel_id);
  return (
    place.kind === "community" &&
    isId(place.community_id) &&
    (place.channel_id === null || isId(place.channel_id))
  );
};

const isDraft = (value: unknown): value is ComposerDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.body === "string" &&
    (draft.reply_to_id === null || isId(draft.reply_to_id))
  );
};

/**
 * All of it. Restoring checks the shape and throws on anything else, which
 * drops the copy: a broken copy costs the person their place, never a crash.
 */
export const sessionCopy: DeviceCopy<SessionState, SessionState> = {
  name: "session",
  version: 1,
  pick: ({ place, lastChannel, drafts }) => ({ place, lastChannel, drafts }),
  restore: (saved) => {
    if (
      !isPlace(saved.place) ||
      !isRecordOf(saved.lastChannel, isId) ||
      !isRecordOf(saved.drafts, isDraft)
    ) {
      throw new Error("not a session copy");
    }
    return {
      place: saved.place,
      lastChannel: saved.lastChannel,
      drafts: saved.drafts,
    };
  },
};

const without = <V>(
  record: Readonly<Record<string, V>>,
  keys: Iterable<string>,
): Readonly<Record<string, V>> => {
  let next: Record<string, V> | null = null;
  for (const key of keys) {
    if (!(key in record)) continue;
    next ??= { ...record };
    delete next[key];
  }
  return next ?? record;
};

export class Session {
  constructor(private readonly port: StatePort<SessionState>) {}

  // ── Where the person is ───────────────────────────────────────────────────

  /** Opens a community at the channel last open there, if there was one. */
  openCommunity(communityId: string): void {
    this.port.set({
      place: {
        kind: "community",
        community_id: communityId,
        channel_id: this.port.get().lastChannel[communityId] ?? null,
      },
    });
  }

  openChannel(communityId: string, channelId: string): void {
    this.port.set({
      place: {
        kind: "community",
        community_id: communityId,
        channel_id: channelId,
      },
      lastChannel: { ...this.port.get().lastChannel, [communityId]: channelId },
    });
  }

  openConversation(channelId: string): void {
    this.port.set({ place: { kind: "conversation", channel_id: channelId } });
  }

  goHome(): void {
    this.port.set({ place: null });
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  /** An empty box with no reply is no draft. Longer than a message is cut. */
  setDraft(channelId: string, draft: ComposerDraft): void {
    const { drafts } = this.port.get();
    if (draft.body === "" && draft.reply_to_id === null) {
      this.port.set({ drafts: without(drafts, [channelId]) });
      return;
    }
    this.port.set({
      drafts: {
        ...drafts,
        [channelId]: {
          body: draft.body.slice(0, DRAFT_LIMIT),
          reply_to_id: draft.reply_to_id,
        },
      },
    });
  }

  /** After sending. */
  clearDraft(channelId: string): void {
    this.port.set({ drafts: without(this.port.get().drafts, [channelId]) });
  }

  // ── What the person can no longer see ─────────────────────────────────────

  /** Left, removed, or the community is gone. `channelIds` are its channels. */
  forgetCommunity(communityId: string, channelIds: readonly string[]): void {
    const state = this.port.get();
    const inside =
      state.place?.kind === "community" &&
      state.place.community_id === communityId;
    this.port.set({
      place: inside ? null : state.place,
      lastChannel: without(state.lastChannel, [communityId]),
      drafts: without(state.drafts, channelIds),
    });
  }

  /** A channel deleted, or no longer visible. */
  forgetChannel(channelId: string): void {
    const state = this.port.get();
    let place = state.place;
    if (place?.channel_id === channelId) {
      place =
        place.kind === "community" ? { ...place, channel_id: null } : null;
    }
    this.port.set({
      place,
      lastChannel: without(
        state.lastChannel,
        Object.keys(state.lastChannel).filter(
          (communityId) => state.lastChannel[communityId] === channelId,
        ),
      ),
      drafts: without(state.drafts, [channelId]),
    });
  }

  clear(): void {
    this.port.set(createSessionState());
  }
}
