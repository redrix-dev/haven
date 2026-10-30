import { Show } from "solid-js";
import { CornerUpLeft, Flag, Pencil, Trash2, UserX } from "lucide-solid";
import { getMessageActions } from "@shared/features/messaging/logic";
import type { ServerPermissions } from "@shared/lib/backend/types";
import {
  ActionsMenu,
  Avatar,
  Markdown,
  type ActionMenuItem,
} from "@solid-client/components/ui";
import { MessageEditor } from "./MessageEditor";
import type { MessageRowItem } from "./messageViewModel";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The viewer's permissions a row needs to decide its actions. */
export type MessageRowPermissions = Pick<
  ServerPermissions,
  "isOwner" | "canManageMessages" | "canCreateReports"
>;

/** Row action props, threaded from the list (renderer seam: no core). */
export type MessageRowActions = {
  viewerId?: string | null;
  permissions?: MessageRowPermissions;
  /** The message whose text is being edited inline, if any. */
  editingMessageId?: string | null;
  onEditMessage?: (messageId: string) => void;
  onSaveEdit?: (messageId: string, content: string) => Promise<void>;
  onCancelEdit?: () => void;
  onDeleteMessage?: (messageId: string, preview: string) => void;
  onReportMessage?: (messageId: string, preview: string) => void;
  onReportUser?: (userId: string, name: string) => void;
};

const NO_PERMISSIONS: MessageRowPermissions = {
  isOwner: false,
  canManageMessages: false,
  canCreateReports: false,
};

export function MessageRow(
  props: { item: MessageRowItem } & MessageRowActions,
) {
  const m = () => props.item.message;
  const editing = () => props.editingMessageId === m().id;

  const items = (): ActionMenuItem[] => {
    const msg = m();
    const permissions = props.permissions ?? NO_PERMISSIONS;
    const actions = getMessageActions({
      message: msg,
      viewerId: props.viewerId,
      permissions,
    });

    const list: ActionMenuItem[] = [];
    if (actions.canEdit) {
      list.push({
        label: "Edit message",
        icon: Pencil,
        onSelect: () => props.onEditMessage?.(msg.id),
      });
    }
    if (actions.canDelete) {
      list.push({
        label: "Delete message",
        icon: Trash2,
        danger: true,
        onSelect: () =>
          props.onDeleteMessage?.(msg.id, reportPreview(msg.content)),
      });
    }
    if (actions.canReport) {
      list.push({
        label: "Report message",
        icon: Flag,
        danger: true,
        onSelect: () =>
          props.onReportMessage?.(msg.id, reportPreview(msg.content)),
      });
    }
    const authorId = msg.authorUserId;
    if (
      authorId &&
      props.viewerId &&
      authorId !== props.viewerId &&
      permissions.canCreateReports
    ) {
      list.push({
        label: `Report ${props.item.authorName}`,
        icon: UserX,
        danger: true,
        onSelect: () => props.onReportUser?.(authorId, props.item.authorName),
      });
    }
    return list;
  };

  const content = () => (
    <Show when={editing()} fallback={<MessageContent item={props.item} />}>
      <MessageEditor
        initialContent={m().content}
        onSave={(text) => props.onSaveEdit?.(m().id, text) ?? Promise.resolve()}
        onCancel={() => props.onCancelEdit?.()}
      />
    </Show>
  );

  return (
    <ActionsMenu items={items()} label="Message actions" enabled={!editing()}>
      <div
        class="px-4 py-0.5 hover:bg-surface-message-row-hover"
        classList={{ "mt-2": props.item.showHeader }}
      >
        <Show when={props.item.replyContext}>
          {(reply) => (
            <div class="mb-0.5 flex items-center gap-1.5 pl-[52px] text-xs text-muted-foreground">
              <CornerUpLeft size={12} />
              <span class="font-semibold">{reply().displayName}</span>
              <span class="truncate">{reply().preview}</span>
            </div>
          )}
        </Show>

        <Show
          when={props.item.showHeader}
          fallback={<div class="pl-[52px]">{content()}</div>}
        >
          <div class="flex gap-3">
            <Avatar
              src={props.item.avatarUrl}
              name={props.item.authorName}
              size="lg"
              class="mt-0.5"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <span class="font-semibold text-foreground">
                  {props.item.authorName}
                </span>
                <Show when={m().isPlatformStaff}>
                  <span class="rounded bg-primary/20 px-1 text-[10px] font-semibold uppercase text-primary">
                    staff
                  </span>
                </Show>
                <span class="text-xs text-muted-foreground">
                  {timeLabel(m().createdAt)}
                </span>
              </div>
              {content()}
            </div>
          </div>
        </Show>
      </div>
    </ActionsMenu>
  );
}

function reportPreview(content: string): string {
  const text = content.trim();
  if (text) return text.length > 280 ? `${text.slice(0, 280)}…` : text;
  return "Attachment or empty message";
}

function MessageContent(props: { item: MessageRowItem }) {
  const m = () => props.item.message;
  return (
    <Show
      when={m().deletedAt === null}
      fallback={
        <p class="text-sm italic text-muted-foreground">Message deleted</p>
      }
    >
      <div class="flex items-baseline gap-1">
        <Markdown content={m().content} class="min-w-0" />
        <Show when={m().editedAt}>
          <span class="shrink-0 text-[10px] text-muted-foreground">
            (edited)
          </span>
        </Show>
      </div>
      <Show when={m().attachment}>
        {(attachment) => (
          <Show
            when={attachment().mediaKind === "image" && attachment().signedUrl}
            fallback={
              <p class="mt-0.5 inline-block rounded bg-surface-embed-chip px-2 py-0.5 text-xs text-attachment-label">
                📎 {attachment().originalFilename ?? attachment().mediaKind}
              </p>
            }
          >
            <img
              src={attachment().signedUrl ?? undefined}
              alt={attachment().originalFilename ?? ""}
              class="mt-1 max-h-80 max-w-sm rounded object-contain"
            />
          </Show>
        )}
      </Show>
    </Show>
  );
}
