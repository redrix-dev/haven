import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type { MessageBundle } from "@shared/lib/backend/types";
import { PERSIST_MESSAGE_CAP } from "./constants";

/**
 * Signed media URLs expire ~1h after minting; null them before persisting so
 * cold start rehydrate does not surface dead links.
 */
export function stripEphemeralMediaUrls(bundle: MessageBundle): MessageBundle {
  if (!bundle.attachment && !bundle.linkPreview?.snapshot?.thumbnail) {
    return bundle;
  }
  return {
    ...bundle,
    attachment: bundle.attachment
      ? { ...bundle.attachment, signedUrl: null }
      : null,
    linkPreview: bundle.linkPreview?.snapshot?.thumbnail
      ? {
          ...bundle.linkPreview,
          snapshot: {
            ...bundle.linkPreview.snapshot,
            thumbnail: {
              ...bundle.linkPreview.snapshot.thumbnail,
              signedUrl: null,
            },
          },
        }
      : bundle.linkPreview,
  };
}

export type PersistedMessageChannelState = {
  byChannel: Record<string, string[]>;
  cursors: Record<string, string | null>;
  hasMore: Record<string, boolean>;
  initialLoadComplete: Record<string, boolean>;
};

export type PersistedMessageSnapshot = {
  entities: Record<string, NexusEntry<MessageBundle>>;
  channelState: PersistedMessageChannelState;
};

export function buildPersistedMessageSnapshot(input: {
  byChannel: Record<string, string[]>;
  cursors: Record<string, string | null>;
  hasMore: Record<string, boolean>;
  initialLoadComplete: Record<string, boolean>;
  entities: Record<string, NexusEntry<MessageBundle>>;
}): PersistedMessageSnapshot {
  const byChannel: Record<string, string[]> = {};
  const cursors: Record<string, string | null> = {};
  const hasMore: Record<string, boolean> = {};
  const initialLoadComplete: Record<string, boolean> = {};
  const entities: Record<string, NexusEntry<MessageBundle>> = {};

  for (const [channelId, ids] of Object.entries(input.byChannel)) {
    if (!ids.length) continue;
    const tail =
      ids.length > PERSIST_MESSAGE_CAP ? ids.slice(-PERSIST_MESSAGE_CAP) : ids;
    const keptIds = tail.filter((id) => {
      const entry = input.entities[id];
      return entry != null && !entry.partial;
    });
    if (!keptIds.length) continue;

    for (const id of keptIds) {
      const entry = input.entities[id];
      entities[id] = {
        ...entry,
        data: stripEphemeralMediaUrls(entry.data),
      };
    }
    byChannel[channelId] = keptIds;

    const droppedOlder = keptIds.length < ids.length;
    hasMore[channelId] = droppedOlder
      ? true
      : (input.hasMore[channelId] ?? false);

    const oldest = input.entities[keptIds[0]]?.data;
    cursors[channelId] = oldest ? `${oldest.createdAt}|${oldest.id}` : null;
    initialLoadComplete[channelId] =
      input.initialLoadComplete[channelId] ?? false;
  }

  return {
    entities,
    channelState: { byChannel, cursors, hasMore, initialLoadComplete },
  };
}
