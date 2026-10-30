import type {
  MessageBundle,
  ServerPermissions,
} from "@shared/lib/backend/types";

/** Which of a message's actions the viewer gets offered. */
export type MessageActions = {
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
};

/**
 * What to offer on a community message. This only decides what the UI shows;
 * Postgres RLS is what enforces it, and this mirrors those policies so the UI
 * never offers something the database will refuse:
 *
 * - edit: the author, while the message isn't deleted (messages_update_self)
 * - delete: the author, the community owner, or manage_messages
 *   (messages_delete_self_or_moderator)
 * - report: create_reports, on someone else's message
 *
 * A deleted message offers nothing.
 */
export function getMessageActions(input: {
  message: Pick<MessageBundle, "authorUserId" | "deletedAt">;
  viewerId: string | null | undefined;
  permissions: Pick<
    ServerPermissions,
    "isOwner" | "canManageMessages" | "canCreateReports"
  >;
}): MessageActions {
  const { message, viewerId, permissions } = input;
  if (!viewerId || message.deletedAt !== null) {
    return { canEdit: false, canDelete: false, canReport: false };
  }
  const isAuthor = message.authorUserId === viewerId;
  return {
    canEdit: isAuthor,
    canDelete: isAuthor || permissions.isOwner || permissions.canManageMessages,
    canReport:
      !isAuthor &&
      message.authorUserId !== null &&
      permissions.canCreateReports,
  };
}
