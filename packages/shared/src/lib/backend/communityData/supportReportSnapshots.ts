/**
 * Support-report snapshot builders: capture moderation evidence for a reported
 * message or profile — the author profile plus surrounding context.
 *
 * Reply chains are rebuilt by walking up to the thread root, then down through
 * replies; non-replies page +/-5 messages with a (created_at, id) keyset
 * tiebreaker. Do not reduce that tiebreaker to created_at alone.
 */
import { havenCommunitySb } from "./runtime";
import { asObjectRecord } from "./rows";
import type {
  Message,
  SupportReportMessageSnapshot,
  SupportReportProfileSnapshot,
  SupportReportSnapshotMessage,
} from "../types";
import type { Database } from "@shared/types/database";

type ReportProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "avatar_url"
>;

const getReplyToMessageId = (
  message: Pick<Message, "metadata">,
): string | null => {
  const metadata = asObjectRecord(message.metadata);
  const replyToMessageId = metadata?.replyToMessageId;
  return typeof replyToMessageId === "string" &&
    replyToMessageId.trim().length > 0
    ? replyToMessageId
    : null;
};

const compareMessagesByCreatedAt = (
  left: Pick<Message, "created_at" | "id">,
  right: Pick<Message, "created_at" | "id">,
): number => {
  const createdAtComparison = left.created_at.localeCompare(right.created_at);
  if (createdAtComparison !== 0) return createdAtComparison;
  return left.id.localeCompare(right.id);
};

const toSupportReportSnapshotMessage = (
  message: Pick<Message, "id" | "content" | "author_user_id" | "created_at">,
  profile: ReportProfileRow | null,
): SupportReportSnapshotMessage => ({
  id: message.id,
  content: message.content,
  authorUserId: message.author_user_id,
  authorUsername: profile?.username ?? null,
  avatarUrl: profile?.avatar_url ?? null,
  createdAt: message.created_at,
});

const listProfileSnapshotsByUserId = async (
  userIds: readonly (string | null | undefined)[],
) => {
  const uniqueUserIds = Array.from(
    new Set(
      userIds.filter(
        (userId): userId is string =>
          typeof userId === "string" && userId.length > 0,
      ),
    ),
  );
  if (uniqueUserIds.length === 0) {
    return new Map<string, ReportProfileRow>();
  }

  const { data, error } = await havenCommunitySb()
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", uniqueUserIds);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, row as ReportProfileRow]));
};

export const fetchSupportReportProfileSnapshot = async (
  targetUserId: string,
): Promise<SupportReportProfileSnapshot> => {
  const profileByUserId = await listProfileSnapshotsByUserId([targetUserId]);
  const profile = profileByUserId.get(targetUserId) ?? null;

  return {
    targetUserId,
    targetUsername: profile?.username ?? null,
    targetAvatarUrl: profile?.avatar_url ?? null,
    capturedAt: new Date().toISOString(),
  };
};

export const fetchSupportReportMessageSnapshot = async (input: {
  communityId: string;
  channelId: string;
  messageId: string;
}): Promise<SupportReportMessageSnapshot | null> => {
  const { data: reportedMessage, error: reportedMessageError } =
    await havenCommunitySb()
      .from("messages")
      .select("*")
      .eq("community_id", input.communityId)
      .eq("channel_id", input.channelId)
      .eq("id", input.messageId)
      .is("deleted_at", null)
      .maybeSingle();
  if (reportedMessageError) throw reportedMessageError;
  if (!reportedMessage) return null;

  const replyToMessageId = getReplyToMessageId(reportedMessage);
  let orderedContextMessages: Message[] = [];

  if (replyToMessageId) {
    const { data: channelMessages, error: channelMessagesError } =
      await havenCommunitySb()
        .from("messages")
        .select("*")
        .eq("community_id", input.communityId)
        .eq("channel_id", input.channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
    if (channelMessagesError) throw channelMessagesError;

    const messages = (channelMessages ?? []) as Message[];
    const messageById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const childIdsByParentId = new Map<string, string[]>();

    for (const message of messages) {
      const parentId = getReplyToMessageId(message);
      if (!parentId) continue;
      const existingChildIds = childIdsByParentId.get(parentId) ?? [];
      existingChildIds.push(message.id);
      childIdsByParentId.set(parentId, existingChildIds);
    }

    let threadRootId = reportedMessage.id;
    let currentMessage: Message | undefined = reportedMessage;
    while (currentMessage) {
      const parentId = getReplyToMessageId(currentMessage);
      if (!parentId) break;
      const parentMessage = messageById.get(parentId);
      if (!parentMessage) break;
      threadRootId = parentMessage.id;
      currentMessage = parentMessage;
    }

    const threadMessageIds = new Set<string>();
    const pendingIds = [threadRootId];
    while (pendingIds.length > 0) {
      const nextId = pendingIds.pop();
      if (!nextId || threadMessageIds.has(nextId)) continue;
      threadMessageIds.add(nextId);
      const childIds = childIdsByParentId.get(nextId) ?? [];
      for (const childId of childIds) {
        pendingIds.push(childId);
      }
    }
    threadMessageIds.add(reportedMessage.id);

    orderedContextMessages = messages
      .filter((message) => threadMessageIds.has(message.id))
      .sort(compareMessagesByCreatedAt);
  } else {
    const beforeFilter =
      `created_at.lt.${reportedMessage.created_at},` +
      `and(created_at.eq.${reportedMessage.created_at},id.lt.${reportedMessage.id})`;
    const afterFilter =
      `created_at.gt.${reportedMessage.created_at},` +
      `and(created_at.eq.${reportedMessage.created_at},id.gt.${reportedMessage.id})`;

    const [
      { data: contextBeforeRows, error: contextBeforeError },
      { data: contextAfterRows, error: contextAfterError },
    ] = await Promise.all([
      havenCommunitySb()
        .from("messages")
        .select("*")
        .eq("community_id", input.communityId)
        .eq("channel_id", input.channelId)
        .is("deleted_at", null)
        .or(beforeFilter)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5),
      havenCommunitySb()
        .from("messages")
        .select("*")
        .eq("community_id", input.communityId)
        .eq("channel_id", input.channelId)
        .is("deleted_at", null)
        .or(afterFilter)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(5),
    ]);
    if (contextBeforeError) throw contextBeforeError;
    if (contextAfterError) throw contextAfterError;

    orderedContextMessages = [
      ...((contextBeforeRows ?? []) as Message[]).slice().reverse(),
      reportedMessage,
      ...((contextAfterRows ?? []) as Message[]),
    ];
  }

  const authorProfilesByUserId = await listProfileSnapshotsByUserId(
    orderedContextMessages.map((message) => message.author_user_id),
  );
  const reportedMessageIndex = orderedContextMessages.findIndex(
    (message) => message.id === reportedMessage.id,
  );
  const safeReportedMessageIndex =
    reportedMessageIndex >= 0 ? reportedMessageIndex : 0;

  return {
    reportedMessage: toSupportReportSnapshotMessage(
      reportedMessage,
      authorProfilesByUserId.get(reportedMessage.author_user_id ?? "") ?? null,
    ),
    contextBefore: orderedContextMessages
      .slice(0, safeReportedMessageIndex)
      .map((message) =>
        toSupportReportSnapshotMessage(
          message,
          authorProfilesByUserId.get(message.author_user_id ?? "") ?? null,
        ),
      ),
    contextAfter: orderedContextMessages
      .slice(safeReportedMessageIndex + 1)
      .map((message) =>
        toSupportReportSnapshotMessage(
          message,
          authorProfilesByUserId.get(message.author_user_id ?? "") ?? null,
        ),
      ),
    capturedAt: new Date().toISOString(),
  };
};
