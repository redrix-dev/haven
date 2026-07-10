import { Show } from "solid-js";
import { CornerUpLeft, Flag, UserX } from "lucide-solid";
import {
  ActionsMenu,
  Avatar,
  Markdown,
  type ActionMenuItem,
} from "@solid-client/components/ui";
import type { MessageRowItem } from "./messageViewModel";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Report-related row props are threaded from the list (renderer seam: no core). */
export type MessageRowActions = {
  viewerId?: string | null;
  canReport?: boolean;
  onReportMessage?: (messageId: string, preview: string) => void;
  onReportUser?: (userId: string, name: string) => void;
};

export function MessageRow(
  props: { item: MessageRowItem } & MessageRowActions,
) {
  const m = () => props.item.message;

  const items = (): ActionMenuItem[] => {
    const msg = m();
    const authorId = msg.authorUserId;
    const reportable =
      Boolean(props.canReport) &&
      Boolean(props.viewerId) &&
      Boolean(authorId) &&
      authorId !== props.viewerId;
    if (!reportable || !authorId) return [];

    const list: ActionMenuItem[] = [];
    if (msg.deletedAt === null) {
      list.push({
        label: "Report message",
        icon: Flag,
        danger: true,
        onSelect: () =>
          props.onReportMessage?.(msg.id, reportPreview(msg.content)),
      });
    }
    list.push({
      label: `Report ${props.item.authorName}`,
      icon: UserX,
      danger: true,
      onSelect: () => props.onReportUser?.(authorId, props.item.authorName),
    });
    return list;
  };

  return (
    <ActionsMenu items={items()} label="Message actions">
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
          fallback={
            <div class="pl-[52px]">
              <MessageContent item={props.item} />
            </div>
          }
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
              <MessageContent item={props.item} />
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
