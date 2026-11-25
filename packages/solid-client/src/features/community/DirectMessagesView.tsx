import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { BellOff, MessageCirclePlus, X } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { Avatar, Button } from "@solid-client/components/ui";
import {
  conversations,
  isMuted,
  otherPerson,
  unreadCount,
} from "@shared/collections/channels/selectors";
import { latestMessage } from "@shared/collections/messages/selectors";
import { friendIds } from "@shared/collections/social/selectors";
import { answered } from "@shared/collections/kit/requests";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { ChannelChat } from "./ChannelChat";

/**
 * /direct-messages[/:conversationId]: the person's conversations, newest
 * first, and the open one. A conversation is a channel, so it is opened and
 * shown exactly like a community channel (ChannelChat).
 */
export function DirectMessagesView() {
  const core = requireHavenSolidCore();
  const params = useParams();
  const navigate = useNavigate();
  const me = () => core.userId ?? "";

  const list = createMemo(() => conversations(core.stores.channels));
  const other = (channelId: string) =>
    otherPerson(core.stores.channels, channelId, me());
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [opening, setOpening] = createSignal<string | null>(null);
  const [pickerError, setPickerError] = createSignal<string | null>(null);

  // Track the route only; opening reads and writes the session and messages.
  createEffect(() => {
    const id = params.conversationId;
    if (!id) return;
    untrack(() => void core.openConversation(id));
  });

  // The people and the newest message of every conversation listed.
  createEffect(() => {
    const ids = list().map((c) => c.id);
    const people = ids
      .map((id) => other(id))
      .filter((id): id is string => id !== null);
    untrack(() => {
      void core.profiles.ensure(people);
      void core.messages.loadLatest(ids);
    });
  });

  const conversationsLoaded = () =>
    answered(core.stores.channels.requests, "conversations");
  const active = () =>
    params.conversationId
      ? core.stores.channels.byId[params.conversationId]
      : undefined;
  const title = () => {
    const id = params.conversationId;
    const person = id ? other(id) : null;
    return person ? core.nameOf(person) : "Conversation";
  };

  const startWith = async (userId: string) => {
    if (opening()) return;
    setOpening(userId);
    setPickerError(null);
    try {
      const channelId = await core.openConversationWith(userId);
      setPickerOpen(false);
      navigate(`/direct-messages/${channelId}`);
    } catch (error) {
      setPickerError(getErrorMessage(error, "Couldn't start a conversation."));
    } finally {
      setOpening(null);
    }
  };

  return (
    <div class="flex h-full min-w-0 flex-1 bg-surface-app">
      <aside class="flex w-72 shrink-0 flex-col border-r border-border bg-surface-panel">
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h1 class="text-sm font-semibold text-foreground">Direct Messages</h1>
          <Button
            size="icon"
            variant="ghost"
            class="h-8 w-8"
            aria-label="New direct message"
            onClick={() => setPickerOpen(true)}
          >
            <MessageCirclePlus size={16} />
          </Button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <Show
            when={!pickerOpen()}
            fallback={
              <FriendPicker
                error={pickerError()}
                opening={opening()}
                onClose={() => setPickerOpen(false)}
                onSelect={(userId) => void startWith(userId)}
              />
            }
          >
            <Show
              when={list().length > 0}
              fallback={
                <div class="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
                  {conversationsLoaded() ? "No conversations yet." : "Loading…"}
                </div>
              }
            >
              <For each={list()}>
                {(conversation) => {
                  const person = () => other(conversation.id);
                  const name = () => {
                    const id = person();
                    return id ? core.nameOf(id) : "Conversation";
                  };
                  const unread = () =>
                    unreadCount(core.stores.channels, conversation.id);
                  return (
                    <button
                      onClick={() =>
                        navigate(`/direct-messages/${conversation.id}`)
                      }
                      class="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-surface-list-hover"
                      classList={{
                        "bg-surface-row-selected":
                          conversation.id === params.conversationId,
                      }}
                    >
                      <Avatar
                        src={person() ? core.avatarUrl(person()!) : null}
                        name={name()}
                        size="lg"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                          <span
                            class="min-w-0 truncate text-sm text-foreground"
                            classList={{ "font-semibold": unread() > 0 }}
                          >
                            {name()}
                          </span>
                          <Show
                            when={isMuted(
                              core.stores.channels,
                              conversation.id,
                            )}
                          >
                            <BellOff
                              size={12}
                              class="shrink-0 text-muted-foreground"
                            />
                          </Show>
                        </div>
                        <p class="truncate text-xs text-muted-foreground">
                          {latestMessage(core.stores.messages, conversation.id)
                            ?.body || "No messages yet"}
                        </p>
                      </div>
                      <Show when={unread() > 0}>
                        <span class="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-bold text-primary-foreground">
                          {unread() > 99 ? "99+" : unread()}
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <Show
          when={params.conversationId}
          keyed
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              Select a conversation.
            </div>
          }
        >
          {(conversationId) => (
            <Show
              when={active() || !conversationsLoaded()}
              fallback={
                <div class="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  This conversation isn't available.
                </div>
              }
            >
              <header class="flex h-12 shrink-0 items-center border-b border-border px-4">
                <span class="font-semibold text-foreground">{title()}</span>
              </header>
              <ChannelChat
                channelId={conversationId}
                communityId={null}
                placeholder={`Message ${title()}`}
              />
            </Show>
          )}
        </Show>
      </main>
    </div>
  );
}

/** Starting a conversation: with a friend. Anyone else is reached from their card. */
function FriendPicker(props: {
  error: string | null;
  opening: string | null;
  onClose: () => void;
  onSelect: (userId: string) => void;
}) {
  const core = requireHavenSolidCore();
  const friends = createMemo(() =>
    friendIds(core.stores.social, core.userId ?? "")
      .map((id) => ({ id, name: core.nameOf(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  createEffect(() => {
    const ids = friends().map((f) => f.id);
    untrack(() => void core.profiles.ensure(ids));
  });

  return (
    <div class="flex h-full flex-col">
      <div class="mb-2 flex items-center gap-2 px-2">
        <span class="min-w-0 flex-1 text-xs font-semibold uppercase text-muted-foreground">
          New message
        </span>
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          aria-label="Close new direct message"
          onClick={props.onClose}
        >
          <X size={15} />
        </Button>
      </div>
      <Show when={props.error}>
        <p class="mb-2 px-2 text-xs text-send-error">{props.error}</p>
      </Show>
      <Show
        when={friends().length > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center px-5 text-center text-sm text-muted-foreground">
            No friends yet. Anyone else can be messaged from their profile, if
            their settings allow it.
          </div>
        }
      >
        <For each={friends()}>
          {(friend) => (
            <button
              class="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-surface-list-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.opening !== null && props.opening !== friend.id}
              onClick={() => props.onSelect(friend.id)}
            >
              <Avatar
                src={core.avatarUrl(friend.id)}
                name={friend.name}
                size="lg"
              />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {friend.name}
              </span>
              <Show when={props.opening === friend.id}>
                <span class="text-xs text-muted-foreground">Opening…</span>
              </Show>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}
