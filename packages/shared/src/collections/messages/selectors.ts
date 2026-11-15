/** Views over `MessagesState`, worked out when read. Both platforms use these. */

import type { MessageRecord, Permission } from "@shared/lib/backend/records";
import type { MessagesState, OutgoingMessage } from "./messages";

const NONE: readonly MessageRecord[] = Object.freeze([]);

/**
 * The channel's messages still being sent, or refused, in the order they
 * were sent. They show after the window's messages.
 */
export function outgoingMessages(
  state: MessagesState,
  channelId: string,
): readonly OutgoingMessage[] {
  return Object.values(state.outgoing).filter(
    (outgoing) => outgoing.channel_id === channelId,
  );
}

/** The channel's loaded messages, oldest first. */
export function windowMessages(
  state: MessagesState,
  channelId: string,
): readonly MessageRecord[] {
  const window = state.windows[channelId];
  if (!window) return NONE;
  const messages: MessageRecord[] = [];
  for (const id of window.ids) {
    const message = state.byId[id];
    if (message) messages.push(message);
  }
  return messages;
}

/** The channel's newest message, when it is known. */
export function latestMessage(
  state: MessagesState,
  channelId: string,
): MessageRecord | null {
  const id = state.latest[channelId];
  return (id && state.byId[id]) || null;
}

/** What the person is offered on a message. The database decides each again. */
export type MessageActions = {
  reply: boolean;
  edit: boolean;
  delete: boolean;
  /** Report it, and its author. */
  report: boolean;
};

/**
 * In a community, `can` answers from the person's permissions there; in a
 * conversation it is never asked. Only the author edits; the author, or
 * someone with `manage_messages`, deletes.
 */
export function messageActions(
  message: Pick<MessageRecord, "author_id" | "community_id">,
  myId: string,
  can: (permission: Permission) => boolean,
): MessageActions {
  const mine = message.author_id === myId;
  const inCommunity = message.community_id !== null;
  return {
    reply: !inCommunity || can("send_messages"),
    edit: mine,
    delete: mine || (inCommunity && can("manage_messages")),
    report: !mine,
  };
}
