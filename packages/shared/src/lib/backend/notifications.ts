/**
 * Notifications, preferences and phones. DATABASE.md: "Notifications".
 *
 * The database writes every notification and its words; this only reads them
 * and marks them. A safety notice (a report's outcome, a staff decision)
 * cannot be turned off, so the database ignores a preference for one.
 */

import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { rows, rpc } from "./client";
import type {
  Notification,
  NotificationKind,
  NotificationMark,
  NotificationPreference,
  PushDevice,
} from "./records";

export type InboxPage = { before_id?: string; limit?: number };

export type PreferenceValues = {
  in_app: boolean;
  sound: boolean;
  push: boolean;
};

export function createNotificationsBackend(client: HavenSupabaseClient) {
  return {
    /** The inbox, newest first. Dismissed ones are left out. */
    async listNotifications(page: InboxPage = {}): Promise<Notification[]> {
      let query = client
        .from("notifications")
        .select("*")
        .eq("in_app", true)
        .is("dismissed_at", null)
        .order("id", { ascending: false })
        .limit(Math.min(page.limit ?? 50, 200));
      if (page.before_id) query = query.lt("id", page.before_id);
      return rows(await query);
    },

    /** How many the caller has not seen yet, for a badge. */
    async countUnseen(): Promise<number> {
      const { count, error } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("in_app", true)
        .is("seen_at", null)
        .is("dismissed_at", null);
      if (error) rows({ data: null, error });
      return count ?? 0;
    },

    /**
     * Marks notifications seen, read or dismissed, and returns how many
     * changed. No ids means all of the caller's.
     */
    async markNotifications(
      mark: NotificationMark,
      ids?: string[],
    ): Promise<number> {
      return (await rpc(client, "mark_notifications", {
        p_mark: mark,
        p_ids: ids,
      })) as number;
    },

    /** Only kinds the caller changed are listed; the rest are on. */
    async listPreferences(): Promise<NotificationPreference[]> {
      return rows(await client.from("notification_preferences").select("*"));
    },

    async setPreference(
      kind: NotificationKind,
      values: PreferenceValues,
    ): Promise<void> {
      await rpc(client, "set_notification_preference", {
        p_kind: kind,
        p_in_app: values.in_app,
        p_sound: values.sound,
        p_push: values.push,
      });
    },

    async listMyPushDevices(): Promise<PushDevice[]> {
      return rows(await client.from("push_devices").select("*"));
    },

    /**
     * Registers this phone. `installation_id` identifies the app install, so
     * a new token for the same install replaces the old one.
     */
    async registerPushDevice(device: {
      token: string;
      platform: "ios" | "android";
      installation_id?: string;
    }): Promise<PushDevice> {
      return (await rpc(client, "register_push_device", {
        p_token: device.token,
        p_platform: device.platform,
        p_installation_id: device.installation_id,
      })) as PushDevice;
    },

    /** Works for a restricted account too, so signing out always stops pushes. */
    async unregisterPushDevice(token: string): Promise<void> {
      await rpc(client, "unregister_push_device", { p_token: token });
    },
  };
}

export type NotificationsBackend = ReturnType<
  typeof createNotificationsBackend
>;
