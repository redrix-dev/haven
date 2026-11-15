/**
 * Notifications: the person's inbox, how many they have not seen, and their
 * choices about each kind. DATABASE.md: "Notifications".
 *
 * The database writes every notification and its words; this holds the
 * inbox it lists, newest first, and adds each `notification.created` that is
 * meant for the inbox. Marking (seen, read, dismissed) happens in the
 * database, by this device or another, and `notifications.changed` says the
 * inbox should load again; so does marking from here.
 *
 * Nothing here is kept on the device: a notification can be about a message
 * or a report that is later removed.
 */

import type {
  NotificationsBackend,
  PreferenceValues,
} from "@shared/lib/backend/notifications";
import type {
  Notification,
  NotificationKind,
  NotificationMark,
  NotificationPreference,
} from "@shared/lib/backend/records";
import { Requests, type RequestMap } from "../kit/requests";
import { type ById, putRows } from "../kit/rows";
import type { StatePort } from "../kit/statePort";

/** Notifications per page of the inbox. */
export const INBOX_PAGE = 50;

export type Inbox = {
  /** Newest first. */
  readonly ids: readonly string[];
  /** Nothing older exists. */
  readonly atOldest: boolean;
};

/** The person's own row of `notification_preferences`. */
export type MyPreference = Omit<NotificationPreference, "user_id">;

export type NotificationsState = {
  byId: ById<Notification>;
  /** Null until the inbox has loaded. */
  inbox: Inbox | null;
  /** Not seen yet, for a badge. */
  unseen: number;
  /** Only kinds the person changed; every other kind is on. */
  preferences: Readonly<Partial<Record<NotificationKind, MyPreference>>>;
  requests: RequestMap;
};

export const createNotificationsState = (): NotificationsState => ({
  byId: {},
  inbox: null,
  unseen: 0,
  preferences: {},
  requests: {},
});

export type NotificationsBackendPart = Pick<
  NotificationsBackend,
  | "listNotifications"
  | "countUnseen"
  | "markNotifications"
  | "listPreferences"
  | "setPreference"
>;

const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export class Notifications {
  readonly requests: Requests;

  constructor(
    private readonly port: StatePort<NotificationsState>,
    private readonly backend: NotificationsBackendPart,
  ) {
    this.requests = new Requests("notifications", port);
  }

  get(notificationId: string): Notification | undefined {
    return this.port.get().byId[notificationId];
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  /**
   * The newest page of the inbox and the unseen count, replacing what is
   * held. The answer to `notifications.changed` and to reconnecting, so it
   * never joins a load that started before the change.
   */
  load(): Promise<void> {
    return this.requests.refresh("inbox", async (stale) => {
      const [page, unseen] = await Promise.all([
        this.backend.listNotifications({ limit: INBOX_PAGE }),
        this.backend.countUnseen(),
      ]);
      if (stale()) return;
      this.port.set({
        byId: putRows({}, page),
        inbox: {
          ids: page.map((notification) => notification.id),
          atOldest: page.length < INBOX_PAGE,
        },
        unseen,
      });
    });
  }

  /** The page after the oldest one held (scrolling down). */
  loadOlder(): Promise<void> {
    const inbox = this.port.get().inbox;
    const oldest = inbox?.ids[inbox.ids.length - 1];
    if (!inbox || inbox.atOldest || !oldest) return Promise.resolve();
    return this.requests.run("older", async (stale) => {
      const page = await this.backend.listNotifications({
        before_id: oldest,
        limit: INBOX_PAGE,
      });
      const current = this.port.get().inbox;
      if (stale() || !current) return;
      this.port.set({
        byId: putRows(this.port.get().byId, page),
        inbox: {
          ids: [...new Set([...current.ids, ...page.map((n) => n.id)])].sort(
            newestFirst,
          ),
          atOldest: page.length < INBOX_PAGE,
        },
      });
    });
  }

  loadPreferences(): Promise<void> {
    return this.requests.run("preferences", async (stale) => {
      const rows = await this.backend.listPreferences();
      if (stale()) return;
      const preferences: Partial<Record<NotificationKind, MyPreference>> = {};
      for (const { kind, in_app, sound, push } of rows) {
        preferences[kind] = { kind, in_app, sound, push };
      }
      this.port.set({ preferences });
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** No ids means all of the person's. The inbox loads again with the result. */
  async mark(mark: NotificationMark, ids?: string[]): Promise<void> {
    await this.backend.markNotifications(mark, ids);
    await this.load();
  }

  async setPreference(
    kind: NotificationKind,
    values: PreferenceValues,
  ): Promise<void> {
    await this.backend.setPreference(kind, values);
    this.port.set({
      preferences: {
        ...this.port.get().preferences,
        [kind]: { kind, ...values },
      },
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * A new notification. Only one meant for the inbox (`in_app`) shows there;
   * the database sends the others too, for a sound or nothing at all.
   */
  applyCreated(notification: Notification): void {
    if (!notification.in_app || this.get(notification.id)) return;
    const state = this.port.get();
    this.port.set({
      byId: putRows(state.byId, [notification]),
      inbox: state.inbox && {
        ...state.inbox,
        ids: [notification.id, ...state.inbox.ids].sort(newestFirst),
      },
      unseen: notification.seen_at === null ? state.unseen + 1 : state.unseen,
    });
  }

  clear(): void {
    this.requests.clear();
    this.port.set(createNotificationsState());
  }
}
