import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { ArrowLeft, Bell } from "lucide-solid";
import type { PreferenceValues } from "@shared/lib/backend/notifications";
import { preferenceFor } from "@shared/collections/notifications/selectors";
import {
  OPTIONAL_NOTIFICATION_KINDS,
  type OptionalNotificationKind,
} from "@shared/features/notifications/notificationKinds";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenSolidCore } from "@solid-client/core";

const KINDS = Object.keys(
  OPTIONAL_NOTIFICATION_KINDS,
) as OptionalNotificationKind[];

/**
 * How each kind of notification reaches the person: in the inbox, with a
 * sound, as a push to their phone. A change is saved as it is made.
 * Notices about reports and moderation always arrive.
 */
export function NotificationSettings() {
  const core = requireHavenSolidCore();
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal<string | null>(null);

  const set = async (
    kind: OptionalNotificationKind,
    key: keyof PreferenceValues,
    value: boolean,
  ) => {
    setError(null);
    setSaving(`${kind}:${key}`);
    try {
      await core.notifications.setPreference(kind, {
        ...preferenceFor(core.stores.notifications, kind),
        [key]: value,
      });
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save that."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div class="h-full overflow-y-auto bg-surface-app px-8 py-6">
      <div class="mx-auto max-w-3xl">
        <A
          href="/settings/appearance"
          class="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} />
          Appearance
        </A>
        <div class="flex items-center gap-2">
          <Bell size={20} class="text-primary" />
          <h1 class="text-xl font-bold text-foreground">Notifications</h1>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
          Choose how Haven lets you know when people reach out. Notices about
          reports and moderation always arrive.
        </p>

        <div class="mt-8 overflow-hidden rounded-xl border border-border bg-card">
          <div class="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-2 border-b border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span class="text-left">Activity</span>
            <span>In app</span>
            <span>Sound</span>
            <span>Push</span>
          </div>
          <For each={KINDS}>
            {(kind) => (
              <div class="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center gap-2 border-b border-border px-4 py-4 last:border-b-0">
                <div>
                  <p class="text-sm font-medium text-foreground">
                    {OPTIONAL_NOTIFICATION_KINDS[kind].label}
                  </p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {OPTIONAL_NOTIFICATION_KINDS[kind].description}
                  </p>
                </div>
                <For each={["in_app", "sound", "push"] as const}>
                  {(key) => (
                    <label class="flex justify-center">
                      <span class="sr-only">
                        {OPTIONAL_NOTIFICATION_KINDS[kind].label} {key}
                      </span>
                      <input
                        type="checkbox"
                        checked={
                          preferenceFor(core.stores.notifications, kind)[key]
                        }
                        disabled={saving() !== null}
                        onChange={(event) =>
                          void set(kind, key, event.currentTarget.checked)
                        }
                        class="h-4 w-4 accent-primary"
                      />
                    </label>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
        <Show when={error()}>
          <p class="mt-4 text-sm text-destructive">{error()}</p>
        </Show>
      </div>
    </div>
  );
}
