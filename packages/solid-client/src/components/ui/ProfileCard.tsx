import { Show } from "solid-js";
import type { PlatformStaffInfo } from "@shared/lib/backend/controlPlaneBackend.interface";
import type {
  UserFlairBadge,
  UserProfileCard as UserProfileCardData,
} from "@shared/lib/backend/types";
import { Avatar } from "./Avatar";

export function ProfileCard(props: {
  card: UserProfileCardData;
  staff?: PlatformStaffInfo | null;
}) {
  return (
    <article class="overflow-hidden rounded-xl border border-border bg-card">
      <div class="h-16 bg-surface-info" />
      <div class="px-5 pb-5">
        <Avatar
          src={props.card.avatarUrl}
          name={props.card.username}
          size="lg"
          class="-mt-5 h-14 w-14 border-4 border-card text-base"
        />
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-bold text-foreground">
            {props.card.username}
          </h2>
          <Show when={props.staff?.isActive && props.staff.displayPrefix}>
            <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {props.staff!.displayPrefix}
            </span>
          </Show>
        </div>

        <Show
          when={props.card.canViewDetails && props.card.details}
          fallback={
            <p class="mt-3 text-sm text-muted-foreground">
              This profile's details are private.
            </p>
          }
        >
          {(details) => (
            <div class="mt-3 space-y-3">
              <Show when={details().activeFlair}>
                {(flair) => <ProfileFlair flair={flair()} />}
              </Show>
              <p class="whitespace-pre-wrap text-sm leading-6 text-body-soft">
                {details().bio || "No bio yet."}
              </p>
            </div>
          )}
        </Show>
      </div>
    </article>
  );
}

export function ProfileFlair(props: { flair: UserFlairBadge }) {
  const token = (value: string, fallback: string) => {
    const safe = value.match(/^[a-z0-9-]+$/i) ? value : fallback;
    return `var(--${safe}, var(--${fallback}))`;
  };

  return (
    <span
      class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{
        color: token(props.flair.colorToken, "foreground"),
        "border-color": token(props.flair.colorToken, "border"),
        "background-color": token(props.flair.backgroundToken, "muted"),
      }}
      title={props.flair.description ?? props.flair.label}
    >
      {props.flair.label}
    </span>
  );
}
