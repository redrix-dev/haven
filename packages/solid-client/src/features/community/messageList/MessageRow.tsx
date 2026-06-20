import { Show } from "solid-js";
import { CornerUpLeft } from "lucide-solid";
import { Avatar, Markdown } from "@solid-client/components/ui";
import type { MessageRowItem } from "./messageViewModel";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageRow(props: { item: MessageRowItem }) {
  const m = () => props.item.message;

  return (
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
  );
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
