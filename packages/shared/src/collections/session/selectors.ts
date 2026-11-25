/** Views over `SessionState`. Both platforms use these. */

import type { ComposerDraft, SessionState } from "./session";

const EMPTY: ComposerDraft = Object.freeze({ body: "", reply_to_id: null });

/** The channel on screen: a community's channel or a conversation. */
export const openChannelId = (state: SessionState): string | null =>
  state.place?.channel_id ?? null;

export const openCommunityId = (state: SessionState): string | null =>
  state.place?.kind === "community" ? state.place.community_id : null;

/** What is in the box for a channel; an empty one when nothing is. */
export const draftFor = (
  state: SessionState,
  channelId: string,
): ComposerDraft => state.drafts[channelId] ?? EMPTY;
