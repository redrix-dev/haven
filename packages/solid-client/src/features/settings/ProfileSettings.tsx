import { A } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ArrowLeft, Check, UserRound } from "lucide-solid";
import type { UserFlairGrant } from "@shared/lib/backend/types";
import { ProfileCard, ProfileFlair } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";

export function ProfileSettings() {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const userId = () => session()?.user.id ?? null;
  const viewer = core.profiles.viewerProfile(userId);
  const card = core.profiles.profileCard(userId);
  const cardLoading = core.profiles.profileCardLoading(userId);
  const cardError = core.profiles.profileCardError(userId);
  const flairs = core.profiles.userFlairs(userId);
  const flairsLoading = core.profiles.userFlairsLoading(userId);
  const flairsError = core.profiles.userFlairsError(userId);
  const staff = core.profiles.platformStaffInfo(userId);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [savingFlairId, setSavingFlairId] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  const selectedFlair = createMemo(
    () => flairs().find((grant) => grant.isSelected) ?? null,
  );

  const load = async (id: string) => {
    setLoadError(null);
    const results = await Promise.allSettled([
      core.profiles.ensureViewerProfile(id),
      core.profiles.ensureMyUserFlairs(id),
      core.profiles.loadProfileCard(id),
      core.profiles.ensurePlatformStaff(id),
    ]);
    if (results.every((result) => result.status === "rejected")) {
      setLoadError("Couldn't load your profile. Try again.");
    }
  };

  createEffect(() => {
    const id = userId();
    if (id) void load(id);
  });

  const chooseFlair = async (grant: UserFlairGrant | null) => {
    const id = userId();
    if (!id || savingFlairId()) return;
    if (grant?.isSelected || (!grant && !selectedFlair())) return;
    setSavingFlairId(grant?.userFlairId ?? "none");
    setSaveError(null);
    try {
      await core.profiles.setActiveUserFlair(id, grant?.userFlairId ?? null);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Couldn't update your flair.",
      );
    } finally {
      setSavingFlairId(null);
    }
  };

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
          <h1 class="text-xl font-bold text-foreground">Profile</h1>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
          Preview the profile people see and choose the flair shown beside your
          name.
        </p>

        <Show when={loadError()}>
          <div class="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError()}
            <Show when={userId()}>
              {(id) => (
                <button
                  type="button"
                  class="ml-2 font-semibold underline"
                  onClick={() => void load(id())}
                >
                  Retry
                </button>
              )}
            </Show>
          </div>
        </Show>

        <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section>
            <h2 class="mb-3 text-sm font-semibold text-foreground">
              Profile preview
            </h2>
            <Show
              when={card()}
              fallback={
                <div class="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  {cardLoading()
                    ? "Loading profile preview…"
                    : cardError() ||
                      (viewer()
                        ? "Profile preview isn't available yet."
                        : "Your profile isn't available yet.")}
                </div>
              }
            >
              {(profileCard) => (
                <ProfileCard card={profileCard()} staff={staff()} />
              )}
            </Show>
          </section>

          <section>
            <h2 class="text-sm font-semibold text-foreground">Profile flair</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              You can display one available flair at a time, or none.
            </p>

            <Show when={saveError() || flairsError()}>
              <p class="mt-3 text-sm text-destructive">
                {saveError() || flairsError()}
              </p>
            </Show>

            <Show
              when={!flairsLoading()}
              fallback={
                <p class="mt-4 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  Loading flair choices…
                </p>
              }
            >
              <div class="mt-4 space-y-2">
                <FlairChoice
                  label="No flair"
                  selected={selectedFlair() === null}
                  disabled={savingFlairId() !== null}
                  pending={savingFlairId() === "none"}
                  onClick={() => void chooseFlair(null)}
                />
                <For
                  each={flairs()}
                  fallback={
                    <p class="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      You don't have any flair yet.
                    </p>
                  }
                >
                  {(grant) => (
                    <FlairChoice
                      label={grant.label}
                      description={grant.description}
                      flair={grant}
                      selected={grant.isSelected}
                      disabled={savingFlairId() !== null || !grant.isAvailable}
                      pending={savingFlairId() === grant.userFlairId}
                      onClick={() => void chooseFlair(grant)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>
      </div>
    </div>
  );
}

function FlairChoice(props: {
  label: string;
  description?: string | null;
  flair?: UserFlairGrant;
  selected: boolean;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={props.onClick}
      class="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary disabled:opacity-60"
      classList={{ "border-primary ring-1 ring-ring": props.selected }}
    >
      <div class="min-w-0 flex-1">
        <Show
          when={props.flair}
          fallback={
            <span class="text-sm font-medium text-foreground">
              {props.label}
            </span>
          }
        >
          {(flair) => <ProfileFlair flair={flair()} />}
        </Show>
        <Show when={props.description}>
          <p class="mt-1 text-xs text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <Show when={props.pending}>
        <span class="text-xs text-muted-foreground">Saving…</span>
      </Show>
      <Show when={props.selected && !props.pending}>
        <Check size={17} class="text-primary" />
      </Show>
    </button>
  );
}
