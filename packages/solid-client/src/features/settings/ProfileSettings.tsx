import { A } from "@solidjs/router";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  type JSX,
} from "solid-js";
import { ArrowLeft, Check, Shield, UserRound } from "lucide-solid";
import type { Audience, HeldFlair } from "@shared/lib/backend/records";
import {
  activeFlair,
  usableFlairs,
} from "@shared/collections/account/selectors";
import {
  AUDIENCE_LABELS,
  PRIVACY_RULES,
  PRIVACY_RULE_ORDER,
  type PrivacyRule,
} from "@shared/features/profile/privacyRules";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  Avatar,
  Button,
  ProfileCard,
  ProfileFlair,
  TextField,
} from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";

/**
 * The person's own profile: name, picture, bio and flair; and who may reach
 * them. The preview is their card as the database answers it for them.
 */
export function ProfileSettings() {
  const core = requireHavenSolidCore();
  const account = core.stores.account;
  const me = () => core.userId ?? "";
  const profile = () => core.stores.profiles.byId[me()];
  const card = () => core.stores.profiles.cards[me()];

  // Track the person only; the card load reads and writes profiles.
  createEffect(() => {
    const id = me();
    if (!id) return;
    untrack(() => void core.profiles.loadCard(id).catch(() => {}));
  });
  const refreshCard = () => void core.profiles.loadCard(me()).catch(() => {});

  return (
    <div class="h-full overflow-y-auto bg-surface-app px-8 py-6">
      <div class="mx-auto max-w-4xl">
        <A
          href="/settings/appearance"
          class="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} />
          Appearance
        </A>
        <div class="flex items-center gap-2">
          <UserRound size={20} class="text-primary" />
          <h1 class="text-xl font-bold text-foreground">Profile & privacy</h1>
        </div>

        <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section>
            <h2 class="mb-3 text-sm font-semibold text-foreground">
              What others see
            </h2>
            <Show
              when={card()}
              fallback={
                <div class="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Loading profile preview…
                </div>
              }
            >
              {(shown) => (
                <ProfileCard
                  card={shown()}
                  name={profile()?.username ?? ""}
                  avatarUrl={core.avatarUrl(me())}
                />
              )}
            </Show>
          </section>

          <div class="space-y-6">
            <Show when={profile() && account.profile}>
              <ProfileForm onSaved={refreshCard} />
            </Show>
            <FlairPicker onSaved={refreshCard} />
            <PrivacyForm onSaved={refreshCard} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel(props: {
  title: string;
  children: JSX.Element;
  icon?: JSX.Element;
}) {
  return (
    <section class="rounded-xl border border-border bg-card p-5">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
        {props.icon}
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function ProfileForm(props: { onSaved: () => void }) {
  const core = requireHavenSolidCore();
  const me = () => core.userId ?? "";
  const [username, setUsername] = createSignal(
    core.stores.profiles.byId[me()]?.username ?? "",
  );
  const [bio, setBio] = createSignal(core.stores.account.profile?.bio ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await core.updateProfile({ username: username().trim(), bio: bio() });
      setSaved(true);
      props.onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const setPicture = async (file: File | null) => {
    setSaving(true);
    setError(null);
    try {
      await core.setAvatar(
        file
          ? {
              body: file,
              mime_type: file.type,
              size_bytes: file.size,
              filename: file.name,
            }
          : null,
      );
      props.onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't change your picture."));
    } finally {
      setSaving(false);
      if (fileInput) fileInput.value = "";
    }
  };

  return (
    <Panel title="Profile">
      <div class="mt-4 flex items-center gap-3">
        <Avatar src={core.avatarUrl(me())} name={username()} size="lg" />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void setPicture(file);
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={saving()}
          onClick={() => fileInput?.click()}
        >
          Change picture
        </Button>
        <Show when={core.stores.profiles.byId[me()]?.avatar_media_id}>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving()}
            onClick={() => void setPicture(null)}
          >
            Remove
          </Button>
        </Show>
      </div>
      <TextField
        class="mt-4"
        value={username()}
        onChange={setUsername}
        label="Username"
        disabled={saving()}
        required
      />
      <label class="mt-4 flex flex-col gap-1 text-sm font-medium text-form-label">
        Bio
        <textarea
          rows={4}
          value={bio()}
          onInput={(event) => setBio(event.currentTarget.value)}
          disabled={saving()}
          placeholder="A little about you"
          class="resize-none rounded-lg border border-input bg-surface-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden disabled:opacity-50"
        />
      </label>
      <Show when={error()}>
        <p class="mt-3 text-sm text-destructive">{error()}</p>
      </Show>
      <div class="mt-4 flex items-center gap-3">
        <Button disabled={saving()} onClick={() => void save()}>
          {saving() ? "Saving…" : "Save profile"}
        </Button>
        <Show when={saved()}>
          <span class="text-xs text-muted-foreground">Saved</span>
        </Show>
      </div>
    </Panel>
  );
}

function FlairPicker(props: { onSaved: () => void }) {
  const core = requireHavenSolidCore();
  const flairs = createMemo(() => usableFlairs(core.stores.account));
  const selected = () => activeFlair(core.stores.account)?.flair_id ?? null;
  const [saving, setSaving] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const choose = async (held: HeldFlair | null) => {
    const id = held?.flair_id ?? null;
    if (saving() || id === selected()) return;
    setSaving(id ?? "none");
    setError(null);
    try {
      await core.account.setActiveFlair(id);
      props.onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't update your flair."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Panel title="Flair">
      <p class="mt-1 text-xs text-muted-foreground">
        One at a time, or none. It shows on your card to the people who may see
        your details.
      </p>
      <Show when={error()}>
        <p class="mt-3 text-sm text-destructive">{error()}</p>
      </Show>
      <div class="mt-4 space-y-2">
        <Choice
          selected={selected() === null}
          pending={saving() === "none"}
          disabled={saving() !== null}
          onClick={() => void choose(null)}
        >
          <span class="text-sm font-medium text-foreground">No flair</span>
        </Choice>
        <For
          each={flairs()}
          fallback={
            <p class="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              You don't have any flair yet.
            </p>
          }
        >
          {(held) => (
            <Choice
              selected={selected() === held.flair_id}
              pending={saving() === held.flair_id}
              disabled={saving() !== null}
              onClick={() => void choose(held)}
            >
              <ProfileFlair flair={held.flair} />
              <Show when={held.flair.description}>
                <p class="mt-1 text-xs text-muted-foreground">
                  {held.flair.description}
                </p>
              </Show>
            </Choice>
          )}
        </For>
      </div>
    </Panel>
  );
}

function Choice(props: {
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={() => props.onClick()}
      class="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary disabled:opacity-60"
      classList={{ "border-primary ring-1 ring-ring": props.selected }}
    >
      <div class="min-w-0 flex-1">{props.children}</div>
      <Show when={props.pending}>
        <span class="text-xs text-muted-foreground">Saving…</span>
      </Show>
      <Show when={props.selected && !props.pending}>
        <Check size={17} class="text-primary" />
      </Show>
    </button>
  );
}

/** Each rule is saved as it is picked; the settings row comes back in the answer. */
function PrivacyForm(props: { onSaved: () => void }) {
  const core = requireHavenSolidCore();
  const settings = () => core.stores.account.settings;
  const [saving, setSaving] = createSignal<PrivacyRule | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const set = async (rule: PrivacyRule, audience: Audience) => {
    setSaving(rule);
    setError(null);
    try {
      await core.account.updateSettings({ [rule]: audience });
      props.onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't save that."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Panel title="Privacy" icon={<Shield size={16} class="text-primary" />}>
      <p class="mt-1 text-xs text-muted-foreground">
        Someone you block is shut out of all of these.
      </p>
      <Show when={error()}>
        <p class="mt-3 text-sm text-destructive">{error()}</p>
      </Show>
      <Show
        when={settings()}
        fallback={<p class="mt-4 text-sm text-muted-foreground">Loading…</p>}
      >
        {(current) => (
          <div class="mt-4 space-y-5">
            <For each={PRIVACY_RULE_ORDER}>
              {(rule) => (
                <label class="block">
                  <span class="block text-sm font-medium text-foreground">
                    {PRIVACY_RULES[rule].label}
                  </span>
                  <span class="mt-0.5 block text-xs text-muted-foreground">
                    {PRIVACY_RULES[rule].description}
                  </span>
                  <select
                    value={current()[rule]}
                    disabled={saving() !== null}
                    onChange={(e) =>
                      void set(rule, e.currentTarget.value as Audience)
                    }
                    class="mt-2 w-full rounded border border-border-control bg-surface-input px-2 py-2 text-sm text-foreground"
                  >
                    <For each={PRIVACY_RULES[rule].audiences}>
                      {(audience) => (
                        <option value={audience}>
                          {AUDIENCE_LABELS[audience]}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              )}
            </For>
          </div>
        )}
      </Show>
    </Panel>
  );
}
