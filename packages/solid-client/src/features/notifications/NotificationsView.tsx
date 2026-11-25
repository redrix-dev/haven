import { For, Show, createMemo, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Bell, Check, X } from "lucide-solid";
import type { Notification } from "@shared/lib/backend/records";
import { inboxNotifications } from "@shared/collections/notifications/selectors";
import { buildHavenLinkPath, notificationIntent } from "@shared/features/links";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar, Button } from "@solid-client/components/ui";

/**
 * The inbox, newest first, as the database wrote each notification (title
 * and body included). Opening it marks everything seen, which clears the
 * badge; opening one marks it read and goes where it points.
 */
export function NotificationsView() {
  const core = requireHavenSolidCore();
  const notifications = createMemo(() =>
    inboxNotifications(core.stores.notifications),
  );
  const unread = () => notifications().some((n) => n.read_at === null);
  const inbox = () => core.stores.notifications.inbox;

  onMount(() => {
    if (core.stores.notifications.unseen > 0) {
      void core.notifications.mark("seen").catch(() => {});
    }
  });

  return (
    <div class="flex h-full flex-col bg-surface-app">
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div class="flex items-center gap-2">
          <Bell size={18} class="text-muted-foreground" />
          <span class="font-semibold text-foreground">Notifications</span>
        </div>
        <Show when={unread()}>
          <button
            type="button"
            onClick={() => void core.notifications.mark("read")}
            class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Check size={13} />
            Mark all read
          </button>
        </Show>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={notifications().length > 0} fallback={<EmptyState />}>
          <For each={notifications()}>
            {(item) => <NotificationRow item={item} />}
          </For>
          <Show when={inbox() && !inbox()!.atOldest}>
            <div class="flex justify-center p-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void core.notifications.loadOlder()}
              >
                Show older
              </Button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function NotificationRow(props: { item: Notification }) {
  const core = requireHavenSolidCore();
  const navigate = useNavigate();
  const unread = () => props.item.read_at === null;
  const actor = () => props.item.actor_id;

  const open = () => {
    if (unread()) void core.notifications.mark("read", [props.item.id]);
    const intent = notificationIntent(props.item);
    if (intent && intent.kind !== "notifications") {
      navigate(buildHavenLinkPath(intent));
    }
  };

  return (
    <div
      class="group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-surface-list-hover"
      onClick={open}
    >
      <span
        class="mt-2 h-2 w-2 shrink-0 rounded-full"
        classList={{ "bg-primary": unread(), "bg-transparent": !unread() }}
      />
      <Avatar
        src={actor() ? core.avatarUrl(actor()!) : null}
        name={actor() ? core.nameOf(actor()!) : "Haven"}
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-foreground">{props.item.title}</p>
        <Show when={props.item.body}>
          <p class="mt-0.5 text-xs text-muted-foreground">{props.item.body}</p>
        </Show>
        <p class="mt-1 text-[11px] text-muted-foreground">
          {formatNotificationTime(props.item.created_at)}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(event) => {
          event.stopPropagation();
          void core.notifications.mark("dismissed", [props.item.id]);
        }}
        class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Bell size={28} />
      <p class="text-sm">You're all caught up</p>
    </div>
  );
}

function formatNotificationTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}
