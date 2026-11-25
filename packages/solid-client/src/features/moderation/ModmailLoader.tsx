import { createEffect, createMemo, untrack } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";

/**
 * Renders nothing. Loads the reports of every community the person
 * moderates (`manage_reports`), so modmail and the sidebar badge are filled
 * app-wide. New and changed reports then arrive as events; a moderator who
 * loses `manage_reports` loses that community's reports in the core.
 *
 * Mounted once in the authed layout.
 */
export function ModmailLoader() {
  const core = requireHavenSolidCore();
  const moderated = createMemo(() =>
    Object.keys(core.stores.communities.byId)
      .filter((id) => core.communities.can(id, "manage_reports"))
      .sort()
      .join(","),
  );

  // Track the moderated set only; loading reads the reports store.
  createEffect(() => {
    const ids = moderated() ? moderated().split(",") : [];
    untrack(() => {
      for (const id of ids) {
        if (!(id in core.stores.reports.byCommunity)) {
          void core.reports.loadCommunity(id);
        }
      }
    });
  });

  return null;
}
