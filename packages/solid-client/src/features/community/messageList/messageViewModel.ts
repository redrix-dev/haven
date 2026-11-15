import type {
  LinkPreview,
  MediaRecord,
  MessageRecord,
} from "@shared/lib/backend/records";
import type { OutgoingMessage } from "@shared/collections/messages/messages";
import type { MessageActions } from "@shared/collections/messages/selectors";

/**
 * Messages → render-ready rows. This is the renderer seam: the list below
 * receives only these items (no core, no stores), so the DOM renderer could
 * be swapped without touching data wiring. Everything it needs to know about
 * people and files comes in through `ViewLookups`.
 */

export type AttachmentView = {
  id: string;
  name: string;
  mimeType: string;
  /** A signed link while it works; null until it arrives, or when refused. */
  url: string | null;
  width: number | null;
  height: number | null;
};

export type ReactionView = { emoji: string; count: number; mine: boolean };

export type MessageRowItem = {
  kind: "message";
  /** The message id, or the nonce of one still being sent. */
  id: string;
  message: MessageRecord | null;
  body: string;
  authorId: string;
  authorName: string;
  authorColor: string | null;
  avatarUrl: string | null;
  authorIsStaff: boolean;
  createdAt: string;
  edited: boolean;
  /** Shown only to people who may see a banned member's messages. */
  hidden: boolean;
  attachments: AttachmentView[];
  reactions: ReactionView[];
  linkPreview: (LinkPreview & { imageUrl: string | null }) | null;
  /** False for a continuation row (same author, close in time). */
  showHeader: boolean;
  replyContext: { name: string; preview: string } | null;
  /** Set while the database has not answered; `error` once it refused. */
  outgoing: { nonce: string; error: string | null } | null;
  actions: MessageActions;
};

export type DateDividerItem = {
  kind: "date-divider";
  id: string;
  label: string;
};

export type MessageViewItem = MessageRowItem | DateDividerItem;

export type ViewLookups = {
  me: string;
  nameOf: (userId: string) => string;
  colorOf: (userId: string) => string | null;
  avatarOf: (userId: string) => string | null;
  isStaff: (userId: string) => boolean;
  /** A message outside the window, for reply context, when held. */
  messageOf: (messageId: string) => MessageRecord | undefined;
  fileUrl: (file: MediaRecord) => string | null;
  previewImageUrl: (path: string | null) => string | null;
  actionsOf: (message: MessageRecord) => MessageActions;
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const REPLY_PREVIEW_MAX = 80;
const OUTGOING_ACTIONS: MessageActions = {
  reply: false,
  edit: false,
  delete: false,
  report: false,
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type RowSource = {
  id: string;
  authorId: string;
  createdAt: string;
  replyToId: string | null;
};

function isContinuation(prev: RowSource, next: RowSource): boolean {
  return (
    prev.authorId === next.authorId &&
    next.replyToId === null &&
    Date.parse(next.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS
  );
}

export function buildMessageViewItems(
  messages: readonly MessageRecord[],
  outgoing: readonly OutgoingMessage[],
  look: ViewLookups,
): MessageViewItem[] {
  const items: MessageViewItem[] = [];
  const inWindow = new Map(messages.map((m) => [m.id, m]));
  const now = new Date().toISOString();
  let prev: RowSource | null = null;

  const replyContext = (replyToId: string | null) => {
    if (!replyToId) return null;
    const parent = inWindow.get(replyToId) ?? look.messageOf(replyToId);
    return parent
      ? {
          name: look.nameOf(parent.author_id),
          preview: parent.body.slice(0, REPLY_PREVIEW_MAX),
        }
      : { name: "a message", preview: "" };
  };

  const push = (source: RowSource, row: Omit<MessageRowItem, "showHeader">) => {
    const day = dayKey(source.createdAt);
    if (!prev || dayKey(prev.createdAt) !== day) {
      items.push({
        kind: "date-divider",
        id: `divider:${day}`,
        label: dayLabel(source.createdAt),
      });
    }
    items.push({
      ...row,
      showHeader:
        !prev ||
        dayKey(prev.createdAt) !== day ||
        !isContinuation(prev, source) ||
        row.replyContext !== null,
    });
    prev = source;
  };

  const person = (userId: string) => ({
    authorId: userId,
    authorName: look.nameOf(userId),
    authorColor: look.colorOf(userId),
    avatarUrl: look.avatarOf(userId),
    authorIsStaff: look.isStaff(userId),
  });

  for (const message of messages) {
    push(
      {
        id: message.id,
        authorId: message.author_id,
        createdAt: message.created_at,
        replyToId: message.reply_to_id,
      },
      {
        kind: "message",
        id: message.id,
        message,
        body: message.body,
        ...person(message.author_id),
        createdAt: message.created_at,
        edited: message.edited_at !== null,
        hidden: message.hidden,
        attachments: message.attachments.map((file) => ({
          id: file.id,
          name: file.filename ?? "Attachment",
          mimeType: file.mime_type,
          url: look.fileUrl(file),
          width: file.width,
          height: file.height,
        })),
        reactions: message.reactions.map((reaction) => ({
          emoji: reaction.emoji,
          count: reaction.user_ids.length,
          mine: reaction.user_ids.includes(look.me),
        })),
        linkPreview: message.link_preview
          ? {
              ...message.link_preview,
              imageUrl: look.previewImageUrl(message.link_preview.image_path),
            }
          : null,
        replyContext: replyContext(message.reply_to_id),
        outgoing: null,
        actions: look.actionsOf(message),
      },
    );
  }

  for (const sending of outgoing) {
    push(
      {
        id: sending.nonce,
        authorId: look.me,
        createdAt: now,
        replyToId: sending.reply_to_id ?? null,
      },
      {
        kind: "message",
        id: sending.nonce,
        message: null,
        body: sending.body,
        ...person(look.me),
        createdAt: now,
        edited: false,
        hidden: false,
        attachments: [],
        reactions: [],
        linkPreview: null,
        replyContext: replyContext(sending.reply_to_id ?? null),
        outgoing: {
          nonce: sending.nonce,
          error: sending.error?.message ?? null,
        },
        actions: OUTGOING_ACTIONS,
      },
    );
  }

  return items;
}
