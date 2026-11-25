import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { Ban, Crown, Flag, Undo2, UserMinus } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { usePeople } from "@solid-client/contexts/PeopleProvider";
import {
  ActionsMenu,
  Avatar,
  ConfirmDialog,
  type ActionMenuItem,
} from "@solid-client/components/ui";
import { bansOf, membersOf } from "@shared/collections/members/selectors";
import { memberColor, outranks } from "@shared/collections/roles/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useToast } from "@solid-client/contexts/ToastProvider";

type PendingAction =
  | { kind: "kick"; userId: string; name: string }
  | { kind: "ban"; userId: string; name: string }
  | { kind: "unban"; userId: string; name: string };

/**
 * A community's members, and its ban list for those who manage bans. Kick and
 * ban are offered only on members ranked below the person; the database
 * decides each one again.
 */
export function MembersPanel(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const people = usePeople();
  const toast = useToast();
  const community = () => core.stores.communities.byId[props.communityId];
  const me = () => core.userId ?? "";

  const members = createMemo(() =>
    membersOf(core.stores.members, props.communityId)
      .map((member) => ({
        userId: member.user_id,
        name: core.nameOf(member.user_id, props.communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const bans = createMemo(() => bansOf(core.stores.members, props.communityId));
  const can = (permission: Parameters<typeof core.communities.can>[1]) =>
    core.communities.can(props.communityId, permission);

  const [view, setView] = createSignal<"members" | "bans">("members");
  const [pending, setPending] = createSignal<PendingAction | null>(null);
  const [working, setWorking] = createSignal(false);

  // Track the tab and the community; loading reads the store it writes.
  createEffect(() => {
    const communityId = props.communityId;
    if (view() !== "bans") return;
    untrack(() => void core.members.loadBans(communityId).catch(() => {}));
  });
  createEffect(() => {
    const ids = bans().map((ban) => ban.user_id);
    untrack(() => void core.profiles.ensure(ids));
  });

  const canModerate = (userId: string) => {
    const shown = community();
    return (
      !!shown &&
      can("manage_members") &&
      outranks(core.stores.roles, shown, me(), userId)
    );
  };

  const memberActions = (userId: string, name: string): ActionMenuItem[] =>
    userId === me()
      ? []
      : [
          {
            label: `Report ${name}`,
            icon: Flag,
            danger: true,
            onSelect: () =>
              people.report({
                subject: "person",
                userId,
                communityId: props.communityId,
                name,
              }),
          },
        ];

  const runAction = async (reason: string) => {
    const action = pending();
    if (!action) return;
    setWorking(true);
    try {
      if (action.kind === "kick") {
        await core.members.kick(props.communityId, action.userId);
      } else if (action.kind === "ban") {
        await core.members.ban(props.communityId, action.userId, reason);
      } else {
        await core.members.unban(props.communityId, action.userId);
      }
      setPending(null);
    } catch (error) {
      toast.show({
        title: "That didn't work",
        body: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <aside class="flex w-60 shrink-0 flex-col bg-surface-panel">
      <div class="flex items-center gap-3 px-3 pb-2 pt-3">
        <Tab
          label="Members"
          count={members().length}
          active={view() === "members"}
          onClick={() => setView("members")}
        />
        <Show when={can("manage_bans")}>
          <Tab
            label="Bans"
            count={bans().length}
            active={view() === "bans"}
            onClick={() => setView("bans")}
          />
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Show when={view() === "members"}>
          <For each={members()}>
            {(member) => (
              <ActionsMenu
                items={memberActions(member.userId, member.name)}
                label="Member actions"
                hoverButton={false}
              >
                <div class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-list-hover">
                  <button
                    type="button"
                    onClick={() =>
                      people.openProfile(member.userId, props.communityId)
                    }
                    class="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar
                      src={core.avatarUrl(member.userId)}
                      name={member.name}
                    />
                    <span
                      class="min-w-0 flex-1 truncate text-sm text-body-soft"
                      style={(() => {
                        const color = memberColor(
                          core.stores.roles,
                          props.communityId,
                          member.userId,
                        );
                        return color ? { color } : undefined;
                      })()}
                    >
                      {member.name}
                    </span>
                    <Show when={community()?.owner_id === member.userId}>
                      <Crown size={14} class="shrink-0 text-accent-amber" />
                    </Show>
                  </button>
                  <Show when={canModerate(member.userId)}>
                    <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        title="Kick"
                        onClick={() => setPending({ kind: "kick", ...member })}
                        class="rounded p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        <UserMinus size={14} />
                      </button>
                      <Show when={can("manage_bans")}>
                        <button
                          type="button"
                          title="Ban"
                          onClick={() => setPending({ kind: "ban", ...member })}
                          class="rounded p-1 text-muted-foreground hover:bg-destructive hover:text-primary-foreground"
                        >
                          <Ban size={14} />
                        </button>
                      </Show>
                    </div>
                  </Show>
                </div>
              </ActionsMenu>
            )}
          </For>
        </Show>

        <Show when={view() === "bans"}>
          <Show
            when={bans().length > 0}
            fallback={
              <p class="px-1 text-sm text-muted-foreground">
                No banned members.
              </p>
            }
          >
            <For each={bans()}>
              {(ban) => (
                <div class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-list-hover">
                  <Avatar
                    src={core.avatarUrl(ban.user_id)}
                    name={core.nameOf(ban.user_id)}
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-body-soft">
                      {core.nameOf(ban.user_id)}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {ban.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Unban"
                    onClick={() =>
                      setPending({
                        kind: "unban",
                        userId: ban.user_id,
                        name: core.nameOf(ban.user_id),
                      })
                    }
                    class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-surface-hover hover:text-foreground group-hover:opacity-100"
                  >
                    <Undo2 size={14} />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>

      <ConfirmDialog
        open={pending() !== null}
        title={dialogTitle(pending())}
        description={dialogDescription(pending())}
        confirmLabel={dialogConfirmLabel(pending())}
        danger={pending()?.kind !== "unban"}
        reason={
          pending()?.kind === "ban"
            ? {
                label: "Reason",
                placeholder: "Why are they being banned?",
                required: true,
              }
            : undefined
        }
        pending={working()}
        onConfirm={(reason) => void runAction(reason)}
        onCancel={() => setPending(null)}
      />
    </aside>
  );
}

function Tab(props: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      class="text-xs font-semibold uppercase tracking-wider transition-colors"
      classList={{
        "text-foreground": props.active,
        "text-muted-foreground hover:text-foreground": !props.active,
      }}
    >
      {props.label}
      <Show when={props.count > 0}> — {props.count}</Show>
    </button>
  );
}

function dialogTitle(action: PendingAction | null): string {
  if (!action) return "";
  if (action.kind === "kick") return `Kick ${action.name}?`;
  if (action.kind === "ban") return `Ban ${action.name}?`;
  return `Unban ${action.name}?`;
}

function dialogDescription(action: PendingAction | null): string | undefined {
  if (!action) return undefined;
  if (action.kind === "kick") return "They can rejoin later with an invite.";
  if (action.kind === "ban")
    return "They'll be removed and blocked from rejoining. Their messages are hidden from members while the ban lasts.";
  return "They'll be able to rejoin with an invite.";
}

function dialogConfirmLabel(action: PendingAction | null): string {
  if (!action) return "Confirm";
  if (action.kind === "kick") return "Kick";
  if (action.kind === "ban") return "Ban";
  return "Unban";
}
