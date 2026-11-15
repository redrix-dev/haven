import {
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { UserPlus } from "lucide-solid";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { Avatar, Button } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";

/**
 * /friend/:code: someone's friend link. Opening it only shows who it is from;
 * nobody becomes friends until the person accepts, and declining tells the
 * owner only that someone declined. Leaving the screen answers nothing.
 */
export function FriendLinkView() {
  const core = requireHavenSolidCore();
  const params = useParams();
  const navigate = useNavigate();
  const social = core.stores.social;
  const [answering, setAnswering] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Track the code only; opening reads and writes the social store.
  createEffect(() => {
    const code = params.code;
    if (!code) return;
    untrack(() => void core.social.openLink(code));
  });
  onCleanup(() => core.social.closeOpenedLink());

  const opened = () => social.openedLink;
  const status = () => social.requests.opened_link;
  const from = () => opened()?.from;
  const avatar = () => {
    const owner = from();
    return owner
      ? core.backend.media.avatarUrl({
          id: owner.owner_id,
          avatar_media_id: owner.avatar_media_id,
        })
      : null;
  };

  const answer = async (accept: boolean) => {
    setAnswering(true);
    setError(null);
    try {
      await core.social.answerOpenedLink(accept);
      navigate("/friends", { replace: true });
    } catch (cause) {
      setError(getErrorMessage(cause, "That didn't work. Try again."));
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div class="flex h-full w-full items-center justify-center bg-surface-app p-6">
      <div class="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl">
        <Switch
          fallback={
            <p class="text-sm text-muted-foreground">Opening the link…</p>
          }
        >
          <Match when={status()?.error && !opened()}>
            <h1 class="text-lg font-semibold text-foreground">
              This friend link doesn't work any more
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              It may have expired, been used up, or been taken back. Ask for a
              new one.
            </p>
            <Button class="mt-6" onClick={() => navigate("/friends")}>
              Go to friends
            </Button>
          </Match>
          <Match when={from()}>
            {(owner) => (
              <>
                <Avatar
                  src={avatar()}
                  name={owner().username}
                  size="lg"
                  class="mx-auto h-16 w-16 text-lg"
                />
                <Show
                  when={!owner().already_friends}
                  fallback={
                    <>
                      <h1 class="mt-4 text-lg font-semibold text-foreground">
                        You're already friends with {owner().username}
                      </h1>
                      <Button class="mt-6" onClick={() => navigate("/friends")}>
                        Go to friends
                      </Button>
                    </>
                  }
                >
                  <h1 class="mt-4 text-lg font-semibold text-foreground">
                    {owner().username} sent you a friend request
                  </h1>
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    Only accept if you trust the person who sent you this
                    invite. Click accept to become friends, or decline to safely
                    decline the request.
                  </p>
                  <Show when={error()}>
                    <p class="mt-3 text-sm text-destructive">{error()}</p>
                  </Show>
                  <div class="mt-6 flex gap-2">
                    <Button
                      class="flex-1"
                      variant="ghost"
                      disabled={answering()}
                      onClick={() => void answer(false)}
                    >
                      Decline
                    </Button>
                    <Button
                      class="flex-1"
                      disabled={answering()}
                      onClick={() => void answer(true)}
                    >
                      <UserPlus size={15} />
                      Accept
                    </Button>
                  </div>
                </Show>
              </>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  );
}
