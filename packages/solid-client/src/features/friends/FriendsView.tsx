import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  type JSX,
} from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import {
  Check,
  Copy,
  Link2,
  MessageCircle,
  Search,
  Trash2,
  UserMinus,
} from "lucide-solid";
import type { FriendLink } from "@shared/lib/backend/records";
import {
  friendIds,
  incomingRequests,
  outgoingRequests,
  usableLinks,
} from "@shared/collections/social/selectors";
import { buildHavenLink } from "@shared/features/links";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { Avatar, Button, ConfirmDialog } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { usePeople } from "@solid-client/contexts/PeopleProvider";
import { useToast } from "@solid-client/contexts/ToastProvider";

type Tab = "friends" | "requests" | "add" | "blocked";

const TABS: { id: Tab; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "requests", label: "Requests" },
  { id: "add", label: "Add friend" },
  { id: "blocked", label: "Blocked" },
];

/**
 * /friends: the person's friends, the requests waiting on either side, ways
 * to add someone (an exact username, or a friend link they hand out), and
 * who they blocked. Who may send them a request is their own setting
 * (Settings → Privacy); the database applies it.
 */
export function FriendsView() {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const people = usePeople();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = () => core.userId ?? "";
  const social = core.stores.social;

  const [tab, setTab] = createSignal<Tab>(
    params.tab === "requests" ? "requests" : "friends",
  );
  const [busy, setBusy] = createSignal<string | null>(null);
  const [removeTarget, setRemoveTarget] = createSignal<string | null>(null);

  const friends = createMemo(() =>
    friendIds(social, me())
      .map((id) => ({ id, name: core.nameOf(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const incoming = createMemo(() => incomingRequests(social, me()));
  const outgoing = createMemo(() => outgoingRequests(social, me()));
  const blocked = createMemo(() => Object.values(social.blocks));

  createEffect(() => {
    const ids = [
      ...friends().map((f) => f.id),
      ...incoming().map((r) => r.sender_id),
      ...outgoing().map((r) => r.recipient_id),
      ...blocked().map((b) => b.blocked_id),
    ];
    untrack(() => void core.profiles.ensure(ids));
  });

  const act = async (
    key: string,
    work: () => Promise<unknown>,
    done?: string,
  ) => {
    setBusy(key);
    try {
      await work();
      if (done) toast.show({ title: done });
    } catch (error) {
      toast.show({
        title: "That didn't work",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setBusy(null);
    }
  };

  const message = (userId: string) =>
    act(`dm:${userId}`, async () => {
      const channelId = await core.openConversationWith(userId);
      navigate(`/direct-messages/${channelId}`);
    });

  return (
    <div class="flex h-full min-w-0 flex-1 bg-surface-app">
      <aside class="flex w-56 shrink-0 flex-col border-r border-border bg-surface-panel">
        <header class="flex h-12 shrink-0 items-center border-b border-border px-4">
          <h1 class="text-sm font-semibold text-foreground">Friends</h1>
        </header>
        <nav class="flex flex-col gap-1 p-2">
          <For each={TABS}>
            {(item) => (
              <button
                class="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-body-soft hover:bg-surface-list-hover hover:text-foreground"
                classList={{
                  "bg-surface-row-selected text-foreground": tab() === item.id,
                }}
                onClick={() => setTab(item.id)}
              >
                <span>{item.label}</span>
                <Show when={item.id === "requests" && incoming().length > 0}>
                  <span class="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {incoming().length}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </nav>
      </aside>

      <main class="min-h-0 flex-1 overflow-y-auto p-4">
        <Show when={tab() === "friends"}>
          <Show
            when={friends().length > 0}
            fallback={<Empty>No friends yet. Add someone you know.</Empty>}
          >
            <For each={friends()}>
              {(friend) => (
                <PersonRow
                  userId={friend.id}
                  name={friend.name}
                  onOpen={() => people.openProfile(friend.id)}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy() !== null}
                    onClick={() => void message(friend.id)}
                  >
                    <MessageCircle size={15} />
                    Message
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy() !== null}
                    onClick={() => setRemoveTarget(friend.id)}
                  >
                    <UserMinus size={15} />
                  </Button>
                </PersonRow>
              )}
            </For>
          </Show>
        </Show>

        <Show when={tab() === "requests"}>
          <Section title="Waiting for you">
            <Show
              when={incoming().length > 0}
              fallback={<Empty>No requests.</Empty>}
            >
              <For each={incoming()}>
                {(request) => (
                  <PersonRow
                    userId={request.sender_id}
                    name={core.nameOf(request.sender_id)}
                    detail={`Asked ${timeLabel(request.created_at)}`}
                    onOpen={() => people.openProfile(request.sender_id)}
                  >
                    <Button
                      size="sm"
                      disabled={busy() !== null}
                      onClick={() =>
                        void act(
                          request.id,
                          () => core.social.answerRequest(request.id, true),
                          "You're friends now",
                        )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy() !== null}
                      onClick={() =>
                        void act(request.id, () =>
                          core.social.answerRequest(request.id, false),
                        )
                      }
                    >
                      Decline
                    </Button>
                  </PersonRow>
                )}
              </For>
            </Show>
          </Section>
          <Section title="Sent">
            <Show
              when={outgoing().length > 0}
              fallback={<Empty>Nothing sent.</Empty>}
            >
              <For each={outgoing()}>
                {(request) => (
                  <PersonRow
                    userId={request.recipient_id}
                    name={core.nameOf(request.recipient_id)}
                    detail={`Sent ${timeLabel(request.created_at)}`}
                    onOpen={() => people.openProfile(request.recipient_id)}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy() !== null}
                      onClick={() =>
                        void act(request.id, () =>
                          core.social.answerRequest(request.id, false),
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </PersonRow>
                )}
              </For>
            </Show>
          </Section>
        </Show>

        <Show when={tab() === "add"}>
          <AddByUsername />
          <FriendLinks />
        </Show>

        <Show when={tab() === "blocked"}>
          <Show
            when={blocked().length > 0}
            fallback={<Empty>Nobody is blocked.</Empty>}
          >
            <For each={blocked()}>
              {(block) => (
                <PersonRow
                  userId={block.blocked_id}
                  name={core.nameOf(block.blocked_id)}
                  detail="They can't message you, see your details, or ask to be friends."
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy() !== null}
                    onClick={() =>
                      void act(block.blocked_id, () =>
                        core.social.unblock(block.blocked_id),
                      )
                    }
                  >
                    Unblock
                  </Button>
                </PersonRow>
              )}
            </For>
          </Show>
        </Show>
      </main>

      <ConfirmDialog
        open={removeTarget() !== null}
        title={`Remove ${removeTarget() ? core.nameOf(removeTarget()!) : ""}?`}
        description="You stop being friends. Your conversation stays, if your settings still let you message each other."
        confirmLabel="Remove"
        danger
        pending={busy() !== null}
        onConfirm={() => {
          const target = removeTarget();
          if (!target) return;
          void act(target, () => core.social.removeFriend(target)).then(() =>
            setRemoveTarget(null),
          );
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

/**
 * Finding someone by their exact username, never by a partial match: nobody
 * can be found by browsing. Their card says whether they take requests.
 */
function AddByUsername() {
  const core = requireHavenSolidCore();
  const people = usePeople();
  const [username, setUsername] = createSignal("");
  const [looking, setLooking] = createSignal(false);
  const [notFound, setNotFound] = createSignal(false);

  const find = async () => {
    const wanted = username().trim().replace(/^@/, "");
    if (!wanted) return;
    setLooking(true);
    setNotFound(false);
    try {
      const found = await core.backend.people.findUser(wanted);
      if (found && !found.deleted) {
        core.profiles.applyProfile(found);
        people.openProfile(found.id);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  };

  return (
    <Section title="By username">
      <form
        class="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-surface-input px-3 py-2">
          <Search size={16} class="text-muted-foreground" />
          <input
            value={username()}
            placeholder="Their exact username"
            autocapitalize="none"
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => setUsername(event.currentTarget.value)}
            class="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />
        </div>
        <Button type="submit" size="sm" disabled={looking()}>
          {looking() ? "Looking…" : "Find"}
        </Button>
      </form>
      <Show when={notFound()}>
        <p class="mt-2 text-sm text-muted-foreground">
          Nobody has that username.
        </p>
      </Show>
    </Section>
  );
}

const LINK_USES: { label: string; value: number | null }[] = [
  { label: "1 person", value: 1 },
  { label: "5 people", value: 5 },
  { label: "Anyone with it", value: null },
];
const LINK_EXPIRY: { label: string; hours: number }[] = [
  { label: "1 day", hours: 24 },
  { label: "1 week", hours: 168 },
  { label: "30 days", hours: 720 },
];

/**
 * The person's own friend links. Whoever opens one sees who it is from and
 * decides; nobody becomes friends by clicking. The owner is told when
 * someone accepts, and when someone declines (not who).
 */
function FriendLinks() {
  const core = requireHavenSolidCore();
  const toast = useToast();
  const links = createMemo(() => usableLinks(core.stores.social));
  const [uses, setUses] = createSignal<number | null>(1);
  const [hours, setHours] = createSignal(168);
  const [creating, setCreating] = createSignal(false);
  const [copied, setCopied] = createSignal<string | null>(null);

  // The list is not part of the sign-in load; it loads when looked at.
  createEffect(() => untrack(() => void core.social.loadLinks()));

  const share = async (link: FriendLink) => {
    const url = buildHavenLink({ kind: "friend_link", code: link.code });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(link.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.show({ title: "Couldn't copy", body: url });
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const link = await core.social.createLink({
        max_uses: uses(),
        expires_in_hours: hours(),
      });
      await share(link);
      toast.show({ title: "Friend link copied" });
    } catch (error) {
      toast.show({
        title: "Couldn't make a link",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Section title="Friend links">
      <p class="mb-3 text-sm text-muted-foreground">
        Hand a link to someone you know. Opening it asks them whether to accept;
        nobody becomes your friend just by clicking it.
      </p>
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <Picker
          label="Works for"
          value={String(uses())}
          options={LINK_USES.map((o) => ({
            label: o.label,
            value: String(o.value),
          }))}
          onChange={(value) => setUses(value === "null" ? null : Number(value))}
        />
        <Picker
          label="For"
          value={String(hours())}
          options={LINK_EXPIRY.map((o) => ({
            label: o.label,
            value: String(o.hours),
          }))}
          onChange={(value) => setHours(Number(value))}
        />
        <Button size="sm" disabled={creating()} onClick={() => void create()}>
          <Link2 size={15} />
          {creating() ? "Making…" : "Make a link"}
        </Button>
      </div>
      <Show
        when={links().length > 0}
        fallback={<Empty>No links that still work.</Empty>}
      >
        <For each={links()}>
          {(link) => (
            <div class="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
              <code class="min-w-0 flex-1 truncate text-sm text-foreground">
                {link.code}
              </code>
              <span class="text-xs text-muted-foreground">
                {link.max_uses === null
                  ? `${link.uses} used`
                  : `${link.uses} / ${link.max_uses} used`}
                {" · until "}
                {new Date(link.expires_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void share(link)}
              >
                <Show when={copied() === link.id} fallback={<Copy size={15} />}>
                  <Check size={15} />
                </Show>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void core.social.revokeLink(link.id).catch((error: unknown) =>
                    toast.show({
                      title: "Couldn't revoke it",
                      body: getErrorMessage(error, "Try again in a moment."),
                    }),
                  )
                }
              >
                <Trash2 size={15} />
              </Button>
            </div>
          )}
        </For>
      </Show>
    </Section>
  );
}

function Picker(props: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label class="flex flex-col gap-1 text-xs font-medium uppercase text-muted-foreground">
      {props.label}
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        class="rounded border border-border-control bg-surface-input px-2 py-1.5 text-sm normal-case text-foreground"
      >
        <For each={props.options}>
          {(option) => <option value={option.value}>{option.label}</option>}
        </For>
      </select>
    </label>
  );
}

function PersonRow(props: {
  userId: string;
  name: string;
  detail?: string;
  onOpen?: () => void;
  children?: JSX.Element;
}) {
  const core = requireHavenSolidCore();
  return (
    <div class="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-left"
        disabled={!props.onOpen}
        onClick={() => props.onOpen?.()}
      >
        <Avatar
          src={core.avatarUrl(props.userId)}
          name={props.name}
          size="lg"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-foreground">
            {props.name}
          </p>
          <Show when={props.detail}>
            <p class="truncate text-xs text-muted-foreground">{props.detail}</p>
          </Show>
        </div>
      </button>
      {props.children}
    </div>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="mb-6">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Empty(props: { children: JSX.Element }) {
  return <p class="py-4 text-sm text-muted-foreground">{props.children}</p>;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
