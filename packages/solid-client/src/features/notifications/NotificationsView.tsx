import { For, Show, onMount } from "solid-js";
import { Bell, Check, X } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar } from "@solid-client/components/ui";
import {
  getNotificationSummary,
  getNotificationTitle,
} from "@shared/features/notifications/notificationCopy";
import type { NotificationItem } from "@shared/lib/backend/types";

/**
 * The notification inbox. Reads the nexus's inbox projections (which apply the
 * shared filter — DMs, friend requests and dismissed rows are excluded) and
 * drives the read / dismiss / mark-all actions on the nexus. On open it refreshes
 * the inbox and clears the server-side "unseen" badge.
 */
export function NotificationsView() {
  const core = requireHavenSolidCore();
  const notifications = core.notifications.inboxNotifications();
  const unreadCount = core.notifications.inboxUnreadCount();

  onMount(() => {
    void core.notifications
      .ensureInbox()
      .then(() =>
        core.notifications.markSeen(
          notifications()
            .filter((item) => item.seenAt == null)
            .map((item) => item.recipientId),
        ),
      )
      .catch((error) => {
        console.warn("[NotificationsView] inbox load failed", error);
      });
  });

  return (
    <div class="flex h-full flex-col bg-surface-app">
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div class="flex items-center gap-2">
          <Bell size={18} class="text-muted-foreground" />
          <span class="font-semibold text-foreground">Notifications</span>
        </div>
        <Show when={unreadCount() > 0}>
          <button
            type="button"
            onClick={() => void core.notifications.markAllRead()}
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
        </Show>
      </div>
    </div>
  );
}

function NotificationRow(props: { item: NotificationItem }) {
  const core = requireHavenSolidCore();
  const unread = () => props.item.readAt == null;

  return (
    <div
      class="group flex cursor-default items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-surface-list-hover"
      onClick={() => {
        if (unread()) {
          void core.notifications.markRead([props.item.recipientId]);
        }
      }}
    >
      <span
        class="mt-2 h-2 w-2 shrink-0 rounded-full"
        classList={{ "bg-primary": unread(), "bg-transparent": !unread() }}
      />
      <Avatar
        src={props.item.actorAvatarUrl}
        name={props.item.actorUsername ?? "Haven"}
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-foreground">
          {getNotificationTitle(props.item)}
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {getNotificationSummary(props.item)}
        </p>
        <p class="mt-1 text-[11px] text-muted-foreground">
          {formatNotificationTime(props.item.createdAt)}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(event) => {
          event.stopPropagation();
          void core.notifications.dismiss([props.item.recipientId]);
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
