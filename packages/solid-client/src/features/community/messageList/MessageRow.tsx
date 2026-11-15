import { For, Show } from "solid-js";
import {
  CornerUpLeft,
  Flag,
  Pencil,
  SmilePlus,
  Trash2,
  UserX,
} from "lucide-solid";
import {
  ActionsMenu,
  Avatar,
  Markdown,
  type ActionMenuItem,
} from "@solid-client/components/ui";
import { MessageEditor } from "./MessageEditor";
import type { MessageRowItem } from "@shared/features/messaging/messageViewModel";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The reactions offered in the menu. Any emoji can be added by reacting with it. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉"];

/** Row action props, threaded from the list (renderer seam: no core). */
export type MessageRowActions = {
  /** The message whose text is being edited inline, if any. */
  editingMessageId?: string | null;
  onReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string, on: boolean) => void;
  onEditMessage?: (messageId: string) => void;
  onSaveEdit?: (messageId: string, body: string) => Promise<void>;
  onCancelEdit?: () => void;
  onDeleteMessage?: (messageId: string, preview: string) => void;
  onReportMessage?: (messageId: string, preview: string) => void;
  onReportUser?: (userId: string, name: string) => void;
  onOpenProfile?: (userId: string) => void;
  onRetry?: (nonce: string) => void;
  onDiscard?: (nonce: string) => void;
};

export function MessageRow(
  props: { item: MessageRowItem } & MessageRowActions,
) {
  const editing = () => props.editingMessageId === props.item.id;

  const items = (): ActionMenuItem[] => {
    const item = props.item;
    const { actions } = item;
    const list: ActionMenuItem[] = [];
    if (actions.reply) {
      list.push({
        label: "Reply",
        icon: CornerUpLeft,
        onSelect: () => props.onReply?.(item.id),
      });
      for (const emoji of QUICK_REACTIONS) {
        const mine = item.reactions.some((r) => r.emoji === emoji && r.mine);
        list.push({
          label: `${mine ? "Remove" : "React"} ${emoji}`,
          icon: SmilePlus,
          onSelect: () => props.onReact?.(item.id, emoji, !mine),
        });
      }
    }
    if (actions.edit) {
      list.push({
        label: "Edit message",
        icon: Pencil,
        onSelect: () => props.onEditMessage?.(item.id),
      });
    }
    if (actions.delete) {
      list.push({
        label: "Delete message",
        icon: Trash2,
        danger: true,
        onSelect: () => props.onDeleteMessage?.(item.id, preview(item.body)),
      });
    }
    if (actions.report) {
      list.push({
        label: "Report message",
        icon: Flag,
        danger: true,
        onSelect: () => props.onReportMessage?.(item.id, preview(item.body)),
      });
      list.push({
        label: `Report ${item.authorName}`,
        icon: UserX,
        danger: true,
        onSelect: () => props.onReportUser?.(item.authorId, item.authorName),
      });
    }
    return list;
  };

  const content = () => (
    <Show when={editing()} fallback={<MessageContent {...props} />}>
      <MessageEditor
        initialContent={props.item.body}
        onSave={(text) =>
          props.onSaveEdit?.(props.item.id, text) ?? Promise.resolve()
        }
        onCancel={() => props.onCancelEdit?.()}
      />
    </Show>
  );

  return (
    <ActionsMenu
      items={items()}
      label="Message actions"
      enabled={!editing() && props.item.outgoing === null}
    >
      <div
        class="px-4 py-0.5 hover:bg-surface-message-row-hover"
        classList={{
          "mt-2": props.item.showHeader,
          "opacity-60":
            props.item.outgoing !== null && !props.item.outgoing.error,
        }}
      >
        <Show when={props.item.replyContext}>
          {(reply) => (
            <div class="mb-0.5 flex items-center gap-1.5 pl-[52px] text-xs text-muted-foreground">
              <CornerUpLeft size={12} />
              <span class="font-semibold">{reply().name}</span>
              <span class="truncate">{reply().preview}</span>
            </div>
          )}
        </Show>

        <Show
          when={props.item.showHeader}
          fallback={<div class="pl-[52px]">{content()}</div>}
        >
          <div class="flex gap-3">
            <button
              type="button"
              class="mt-0.5 shrink-0 self-start rounded-full"
              aria-label={`${props.item.authorName} profile`}
              onClick={() => props.onOpenProfile?.(props.item.authorId)}
            >
              <Avatar
                src={props.item.avatarUrl}
                name={props.item.authorName}
                size="lg"
              />
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <span
                  role="button"
                  tabindex="0"
                  onClick={() => props.onOpenProfile?.(props.item.authorId)}
                  class="cursor-pointer font-semibold text-foreground hover:underline"
                  style={
                    props.item.authorColor
                      ? { color: props.item.authorColor }
                      : undefined
                  }
                >
                  {props.item.authorName}
                </span>
                <Show when={props.item.authorIsStaff}>
                  <span class="rounded bg-primary/20 px-1 text-[10px] font-semibold uppercase text-primary">
                    staff
                  </span>
                </Show>
                <span class="text-xs text-muted-foreground">
                  {timeLabel(props.item.createdAt)}
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

function preview(body: string): string {
  const text = body.trim();
  if (text) return text.length > 280 ? `${text.slice(0, 280)}…` : text;
  return "Attachment or empty message";
}

function MessageContent(props: { item: MessageRowItem } & MessageRowActions) {
  const item = () => props.item;
  return (
    <>
      <Show when={item().hidden}>
        <p class="text-[11px] italic text-muted-foreground">
          Hidden from members while its author is banned
        </p>
      </Show>
      <div class="flex items-baseline gap-1">
        <Markdown content={item().body} class="min-w-0" />
        <Show when={item().edited}>
          <span class="shrink-0 text-[10px] text-muted-foreground">
            (edited)
          </span>
        </Show>
      </div>

      <For each={item().attachments}>
        {(file) => (
          <Show
            when={file.mimeType.startsWith("image/") && file.url}
            fallback={
              <Show
                when={file.url}
                fallback={
                  <p class="mt-0.5 inline-block rounded bg-surface-embed-chip px-2 py-0.5 text-xs text-attachment-label">
                    📎 {file.name}
                  </p>
                }
              >
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="mt-0.5 inline-block rounded bg-surface-embed-chip px-2 py-0.5 text-xs text-attachment-label hover:underline"
                  >
                    📎 {file.name}
                  </a>
                )}
              </Show>
            }
          >
            {(url) => (
              <img
                src={url()}
                alt={file.name}
                width={file.width ?? undefined}
                height={file.height ?? undefined}
                class="mt-1 max-h-80 max-w-sm rounded object-contain"
              />
            )}
          </Show>
        )}
      </For>

      <Show when={item().linkPreview}>
        {(link) => (
          <a
            href={link().url}
            target="_blank"
            rel="noreferrer"
            class="mt-1 flex max-w-md gap-3 rounded border-l-4 border-primary bg-surface-embed-chip p-2 hover:bg-surface-hover"
          >
            <div class="min-w-0 flex-1">
              <Show when={link().site_name}>
                <p class="text-[11px] text-muted-foreground">
                  {link().site_name}
                </p>
              </Show>
              <p class="truncate text-sm font-semibold text-primary">
                {link().title ?? link().url}
              </p>
              <Show when={link().description}>
                <p class="line-clamp-2 text-xs text-body-soft">
                  {link().description}
                </p>
              </Show>
            </div>
            <Show when={link().imageUrl}>
              {(src) => (
                <img
                  src={src()}
                  alt=""
                  class="h-16 w-16 shrink-0 rounded object-cover"
                />
              )}
            </Show>
          </a>
        )}
      </Show>

      <Show when={item().reactions.length > 0}>
        <div class="mt-1 flex flex-wrap gap-1">
          <For each={item().reactions}>
            {(reaction) => (
              <button
                type="button"
                class="rounded-full border px-2 py-0.5 text-xs"
                classList={{
                  "border-primary bg-primary/10 text-foreground": reaction.mine,
                  "border-border text-body-soft hover:bg-surface-hover":
                    !reaction.mine,
                }}
                onClick={() =>
                  props.onReact?.(item().id, reaction.emoji, !reaction.mine)
                }
              >
                {reaction.emoji} {reaction.count}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={item().outgoing?.error}>
        {(error) => (
          <p class="mt-0.5 flex items-center gap-2 text-xs text-send-error">
            <span>Not sent: {error()}</span>
            <button
              type="button"
              class="font-semibold underline"
              onClick={() => props.onRetry?.(item().outgoing!.nonce)}
            >
              Retry
            </button>
            <button
              type="button"
              class="underline"
              onClick={() => props.onDiscard?.(item().outgoing!.nonce)}
            >
              Discard
            </button>
          </p>
        )}
      </Show>
    </>
  );
}
