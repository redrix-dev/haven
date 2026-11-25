import { For, Show, type JSX } from "solid-js";
import type {
  ProfileCardRecord,
  ProfileFlair as ProfileFlairRecord,
} from "@shared/lib/backend/records";
import { Avatar } from "./Avatar";

/**
 * Someone's card, as the database answered for this viewer: bio and flair
 * only when their details are visible to the viewer. Presentational; what the
 * card offers (Message, Add friend) is the caller's, in `children`.
 */
export function ProfileCard(props: {
  card: ProfileCardRecord;
  avatarUrl: string | null;
  /** What to call them here: a nickname in a community, else the username. */
  name: string;
  children?: JSX.Element;
}) {
  return (
    <article class="overflow-hidden rounded-xl border border-border bg-card">
      <div class="h-16 bg-surface-info" />
      <div class="px-5 pb-5">
        <Avatar
          src={props.avatarUrl}
          name={props.name}
          size="lg"
          class="-mt-5 h-14 w-14 border-4 border-card text-base"
        />
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-bold text-foreground">{props.name}</h2>
          <Show when={props.card.is_staff}>
            <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Haven staff
            </span>
          </Show>
          <Show when={props.card.is_friend}>
            <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Friend
            </span>
          </Show>
        </div>
        <Show when={props.name !== props.card.username && props.card.username}>
          <p class="text-xs text-muted-foreground">@{props.card.username}</p>
        </Show>

        <Show
          when={props.card.details_visible}
          fallback={
            <p class="mt-3 text-sm text-muted-foreground">
              This profile's details are private.
            </p>
          }
        >
          <div class="mt-3 space-y-3">
            <Show when={props.card.flair}>
              {(flair) => <ProfileFlair flair={flair()} />}
            </Show>
            <p class="whitespace-pre-wrap text-sm leading-6 text-body-soft">
              {props.card.bio || "No bio yet."}
            </p>
          </div>
        </Show>

        <Show when={props.card.mutual_community_names.length > 0}>
          <p class="mt-3 text-xs text-muted-foreground">
            Also in{" "}
            <For each={props.card.mutual_community_names}>
              {(name, index) => (
                <>
                  {index() > 0 ? ", " : ""}
                  <span class="text-body-soft">{name}</span>
                </>
              )}
            </For>
          </p>
        </Show>

        <Show when={props.children}>
          <div class="mt-4 flex flex-wrap gap-2">{props.children}</div>
        </Show>
      </div>
    </article>
  );
}

export function ProfileFlair(props: {
  flair: Pick<
    ProfileFlairRecord,
    "label" | "description" | "color_token" | "background_token"
  >;
}) {
  const token = (value: string, fallback: string) => {
    const safe = value.match(/^[a-z0-9-]+$/i) ? value : fallback;
    return `var(--${safe}, var(--${fallback}))`;
  };

  return (
    <span
      class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{
        color: token(props.flair.color_token, "foreground"),
        "border-color": token(props.flair.color_token, "border"),
        "background-color": token(props.flair.background_token, "muted"),
      }}
      title={props.flair.description ?? props.flair.label}
    >
      {props.flair.label}
    </span>
  );
}
