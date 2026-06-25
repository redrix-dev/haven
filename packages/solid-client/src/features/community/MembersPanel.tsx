import { For, Show, createEffect, createSignal } from "solid-js";
import { Ban, Crown, Flag, Undo2, UserMinus } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import {
  ActionsMenu,
  Avatar,
  ConfirmDialog,
  ReportDialog,
  type ActionMenuItem,
  type ReportDialogResult,
} from "@solid-client/components/ui";
import type { CommunityMemberListItem } from "@shared/lib/backend/types";

type PendingAction =
  | { kind: "kick"; member: CommunityMemberListItem }
  | { kind: "ban"; member: CommunityMemberListItem }
  | { kind: "unban"; userId: string; name: string };

export function MembersPanel(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const members = core.admin.members(() => props.communityId);
  const loading = core.admin.membersLoading(() => props.communityId);
  const bans = core.admin.bans(() => props.communityId);

  const myUserId = core.authStore.getState().user?.id ?? null;
  const canManageMembers = () =>
    core.permissions.getPermissions(props.communityId).canManageMembers;
  const canManageBans = () =>
    core.permissions.getPermissions(props.communityId).canManageBans;
  const canReport = () =>
    core.permissions.getPermissions(props.communityId).canCreateReports;

  const [view, setView] = createSignal<"members" | "bans">("members");
  const [pending, setPending] = createSignal<PendingAction | null>(null);
  const [working, setWorking] = createSignal(false);
  const [reportTarget, setReportTarget] = createSignal<{
    userId: string;
    name: string;
  } | null>(null);

  const memberActions = (member: CommunityMemberListItem): ActionMenuItem[] => {
    if (!canReport() || member.userId === myUserId) return [];
    return [
      {
        label: `Report ${member.displayName}`,
        icon: Flag,
        danger: true,
        onSelect: () =>
          setReportTarget({ userId: member.userId, name: member.displayName }),
      },
    ];
  };

  const submitReport = async (result: ReportDialogResult) => {
    const target = reportTarget();
    if (!target || !myUserId) return;
    await core.reportUserProfile({
      communityId: props.communityId,
      targetUserId: target.userId,
      reporterUserId: myUserId,
      reason: result.comment,
      target: result.target,
    });
    setReportTarget(null);
  };

  createEffect(() => {
    void core.ensureCommunityPermissions(props.communityId);
  });
  createEffect(() => {
    void core.admin.ensureMembersLoaded(props.communityId);
  });
  createEffect(() => {
    if (view() === "bans") void core.admin.loadBans(props.communityId);
  });

  const canModerate = (member: CommunityMemberListItem) =>
    canManageMembers() && !member.isOwner && member.userId !== myUserId;

  const runAction = async (reason: string) => {
    const action = pending();
    if (!action) return;
    setWorking(true);
    try {
      if (action.kind === "kick") {
        await core.admin.kickMember({
          communityId: props.communityId,
          targetUserId: action.member.userId,
        });
      } else if (action.kind === "ban") {
        await core.admin.banMember({
          communityId: props.communityId,
          targetUserId: action.member.userId,
          reason,
        });
      } else {
        await core.admin.unbanMember({
          communityId: props.communityId,
          targetUserId: action.userId,
        });
      }
      setPending(null);
    } catch {
      // The cache logged it; leave the dialog open so the user can retry.
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
        <Show when={canManageBans()}>
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
          <Show
            when={!loading() || members().length > 0}
            fallback={<p class="px-1 text-sm text-muted-foreground">Loading…</p>}
          >
            <For each={members()}>
              {(member) => (
                <ActionsMenu
                  items={memberActions(member)}
                  label="Member actions"
                  hoverButton={false}
                >
                <div class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-list-hover">
                  <Avatar src={member.avatarUrl} name={member.displayName} />
                  <span class="min-w-0 flex-1 truncate text-sm text-body-soft">
                    {member.displayName}
                  </span>
                  <Show when={member.isOwner}>
                    <Crown size={14} class="shrink-0 text-accent-amber" />
                  </Show>
                  <Show when={canModerate(member)}>
                    <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        title="Kick"
                        onClick={() => setPending({ kind: "kick", member })}
                        class="rounded p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        <UserMinus size={14} />
                      </button>
                      <button
                        type="button"
                        title="Ban"
                        onClick={() => setPending({ kind: "ban", member })}
                        class="rounded p-1 text-muted-foreground hover:bg-destructive hover:text-primary-foreground"
                      >
                        <Ban size={14} />
                      </button>
                    </div>
                  </Show>
                </div>
                </ActionsMenu>
              )}
            </For>
          </Show>
        </Show>

        <Show when={view() === "bans"}>
          <Show
            when={bans().length > 0}
            fallback={
              <p class="px-1 text-sm text-muted-foreground">No banned members.</p>
            }
          >
            <For each={bans()}>
              {(ban) => (
                <div class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-list-hover">
                  <Avatar src={ban.avatarUrl} name={ban.username} />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-body-soft">{ban.username}</p>
                    <Show when={ban.reason}>
                      <p class="truncate text-xs text-muted-foreground">
                        {ban.reason}
                      </p>
                    </Show>
                  </div>
                  <button
                    type="button"
                    title="Unban"
                    onClick={() =>
                      setPending({
                        kind: "unban",
                        userId: ban.bannedUserId,
                        name: ban.username,
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

      <ReportDialog
        open={reportTarget() !== null}
        title={`Report ${reportTarget()?.name ?? "user"}`}
        subjectLabel="Reported user"
        subjectPreview={reportTarget()?.name}
        showKind={false}
        showTarget
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
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
  if (action.kind === "kick") return `Kick ${action.member.displayName}?`;
  if (action.kind === "ban") return `Ban ${action.member.displayName}?`;
  return `Unban ${action.name}?`;
}

function dialogDescription(action: PendingAction | null): string | undefined {
  if (!action) return undefined;
  if (action.kind === "kick") return "They can rejoin later with an invite.";
  if (action.kind === "ban")
    return "They'll be removed and blocked from rejoining.";
  return "They'll be able to rejoin with an invite.";
}

function dialogConfirmLabel(action: PendingAction | null): string {
  if (!action) return "Confirm";
  if (action.kind === "kick") return "Kick";
  if (action.kind === "ban") return "Ban";
  return "Unban";
}
