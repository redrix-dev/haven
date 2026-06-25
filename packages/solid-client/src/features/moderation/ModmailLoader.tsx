import { createEffect, createMemo } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";

/**
 * Renders nothing — owns the cross-community modmail load so the inbox + the
 * sidebar badge stay populated app-wide (not just while /modmail is open).
 *
 * The moderatable set is derived reactively from permissions: every community
 * where the viewer holds `canManageReports`. When that set changes — a role
 * granted or revoked, a community joined or left — the effect reloads, so a
 * community's mail appears or disappears as access changes. Live new reports
 * arrive via the `report_created` broadcast (routeRealtimeEvent → nexus).
 *
 * Mounted once in the authed layout.
 */
export function ModmailLoader() {
  const core = requireHavenSolidCore();

  const moderatableIds = createMemo(() => {
    const byCommunity = core.permissions.getPermissionsByCommunityId();
    return Object.keys(byCommunity)
      .filter((id) => byCommunity[id]?.canManageReports)
      .sort();
  });

  createEffect(() => {
    void core.moderation.load(moderatableIds());
  });

  return null;
}
