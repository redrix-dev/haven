import { A } from "@solidjs/router";
import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import { ArrowLeft, Bell } from "lucide-solid";
import type {
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";
import { Button } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";

type PreferenceRow = {
  label: string;
  description: string;
  inApp: keyof NotificationPreferenceUpdate;
  sound: keyof NotificationPreferenceUpdate;
  push: keyof NotificationPreferenceUpdate;
};

const rows: PreferenceRow[] = [
  {
    label: "Friend requests",
    description: "New requests and accepted connections.",
    inApp: "friendRequestInAppEnabled",
    sound: "friendRequestSoundEnabled",
    push: "friendRequestPushEnabled",
  },
  {
    label: "Direct messages",
    description: "Messages sent privately to you.",
    inApp: "dmInAppEnabled",
    sound: "dmSoundEnabled",
    push: "dmPushEnabled",
  },
  {
    label: "Mentions",
    description: "Community messages that mention you.",
    inApp: "mentionInAppEnabled",
    sound: "mentionSoundEnabled",
    push: "mentionPushEnabled",
  },
];

const editablePreferences = (
  preferences: NotificationPreferences,
): NotificationPreferenceUpdate => ({
  friendRequestInAppEnabled: preferences.friendRequestInAppEnabled,
  friendRequestSoundEnabled: preferences.friendRequestSoundEnabled,
  friendRequestPushEnabled: preferences.friendRequestPushEnabled,
  dmInAppEnabled: preferences.dmInAppEnabled,
  dmSoundEnabled: preferences.dmSoundEnabled,
  dmPushEnabled: preferences.dmPushEnabled,
  mentionInAppEnabled: preferences.mentionInAppEnabled,
  mentionSoundEnabled: preferences.mentionSoundEnabled,
  mentionPushEnabled: preferences.mentionPushEnabled,
});

export function NotificationSettings() {
  const core = requireHavenSolidCore();
  const preferences = core.notifications.preferences();
  const [draft, setDraft] = createSignal<NotificationPreferenceUpdate | null>(
    null,
  );
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);

  createEffect(() => {
    const current = preferences();
    if (current && draft() == null) setDraft(editablePreferences(current));
  });

  onMount(() => {
    void core.notifications.ensurePreferences().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Couldn't load notification settings.",
      );
    });
  });

  const setPreference = (
    key: keyof NotificationPreferenceUpdate,
    value: boolean,
  ) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    const values = draft();
    if (!values) return;
    setError(null);
    setSaved(false);
    try {
      await core.notifications.savePreferences(values);
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Couldn't save notification settings.",
      );
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
          Choose how Haven lets you know when people reach out.
        </p>

        <Show
          when={draft()}
          fallback={
            <div class="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {core.notifications.state.preferencesLoading
                ? "Loading notification settings…"
                : error() || "Notification settings aren't available yet."}
            </div>
          }
        >
          {(values) => (
            <div class="mt-8 overflow-hidden rounded-xl border border-border bg-card">
              <div class="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-2 border-b border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="text-left">Activity</span>
                <span>In app</span>
                <span>Sound</span>
                <span>Push</span>
              </div>
              <For each={rows}>
                {(row) => (
                  <div class="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center gap-2 border-b border-border px-4 py-4 last:border-b-0">
                    <div>
                      <p class="text-sm font-medium text-foreground">
                        {row.label}
                      </p>
                      <p class="mt-0.5 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    </div>
                    <PreferenceCheckbox
                      label={`${row.label} in-app notifications`}
                      checked={values()[row.inApp]}
                      onChange={(checked) => setPreference(row.inApp, checked)}
                    />
                    <PreferenceCheckbox
                      label={`${row.label} sounds`}
                      checked={values()[row.sound]}
                      onChange={(checked) => setPreference(row.sound, checked)}
                    />
                    <PreferenceCheckbox
                      label={`${row.label} push notifications`}
                      checked={values()[row.push]}
                      onChange={(checked) => setPreference(row.push, checked)}
                    />
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>

        <Show when={error()}>
          <p class="mt-4 text-sm text-destructive">{error()}</p>
        </Show>
        <div class="mt-5 flex items-center justify-end gap-3">
          <Show when={saved()}>
            <span class="text-xs text-muted-foreground">Saved</span>
          </Show>
          <Button
            disabled={!draft() || core.notifications.state.preferencesSaving}
            onClick={() => void save()}
          >
            {core.notifications.state.preferencesSaving
              ? "Saving…"
              : "Save preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreferenceCheckbox(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="flex justify-center">
      <span class="sr-only">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="h-4 w-4 accent-primary"
      />
    </label>
  );
}
