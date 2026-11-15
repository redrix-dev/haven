import {
  notificationIntent,
  type BuildableHavenLinkIntent,
} from "@shared/features/links";

export type PushTap = {
  /** Where the tap goes; the same answer the inbox row gives. */
  intent: BuildableHavenLinkIntent;
  /** The notification it came from, to mark read. */
  notificationId: string | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * A push's `data`, as the database wrote it (`worker_push_delivery`: the
 * notification's id, kind, community and channel), read into where tapping
 * it goes. Null for data that is not a Haven notification, or a kind this
 * build does not know.
 */
export function pushTap(raw: unknown): PushTap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const kind = text(data.kind);
  if (!kind) return null;
  const intent = notificationIntent({
    kind,
    community_id: text(data.community_id),
    channel_id: text(data.channel_id),
  });
  return intent ? { intent, notificationId: text(data.notification_id) } : null;
}
