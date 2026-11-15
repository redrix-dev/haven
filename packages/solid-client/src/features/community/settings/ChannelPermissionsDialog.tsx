import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ShieldCheck, X } from "lucide-solid";
import type { Channel, ChannelOverwrite } from "@shared/lib/backend/records";
import type {
  OverwriteTarget,
  OverwriteValues,
} from "@shared/lib/backend/channels";
import { rolesOf } from "@shared/collections/roles/selectors";
import { membersOf } from "@shared/collections/members/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { Button } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import {
  channelPermissionLabel,
  nextChannelPermission,
} from "./channelPermissionControls";

type PermissionKey = keyof OverwriteValues;

const COLUMNS: Array<{ key: PermissionKey; label: string }> = [
  { key: "can_view", label: "View" },
  { key: "can_send", label: "Send" },
  { key: "can_manage", label: "Manage" },
];

const NONE: OverwriteValues = {
  can_view: null,
  can_send: null,
  can_manage: null,
};

type Row = {
  key: string;
  name: string;
  target: OverwriteTarget;
  values: OverwriteValues;
};

/**
 * A channel's exceptions to the community's roles: for a role, or for one
 * member, each of view, send and manage is left to the roles (Default),
 * allowed, or denied. Overwrites are an admin's view, read when the dialog
 * opens (`manage_channel_permissions`); who may see what changes for
 * everyone through `access.changed`.
 */
export function ChannelPermissionsDialog(props: {
  communityId: string;
  channel: Channel;
  onClose: () => void;
}) {
  const core = requireHavenSolidCore();
  const [overwrites, { refetch }] = createResource(
    () => props.channel.id,
    (channelId) => core.backend.channels.listOverwrites(channelId),
  );
  const [pending, setPending] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [memberShown, setMemberShown] = createSignal<string>("");

  const valuesOf = (row: ChannelOverwrite | undefined): OverwriteValues =>
    row
      ? {
          can_view: row.can_view,
          can_send: row.can_send,
          can_manage: row.can_manage,
        }
      : NONE;

  const roleRows = createMemo<Row[]>(() => {
    const byRole = new Map(
      (overwrites() ?? []).filter((o) => o.role_id).map((o) => [o.role_id!, o]),
    );
    return rolesOf(core.stores.roles, props.communityId).map((role) => ({
      key: `role:${role.id}`,
      name: role.is_everyone ? "@everyone" : role.name,
      target: { role_id: role.id },
      values: valuesOf(byRole.get(role.id)),
    }));
  });

  const memberRows = createMemo<Row[]>(() => {
    const rows = (overwrites() ?? [])
      .filter((o) => o.user_id)
      .map((o) => ({
        key: `member:${o.user_id}`,
        name: core.nameOf(o.user_id!, props.communityId),
        target: { user_id: o.user_id! },
        values: valuesOf(o),
      }));
    const shown = memberShown();
    if (shown && !rows.some((r) => r.key === `member:${shown}`)) {
      rows.push({
        key: `member:${shown}`,
        name: core.nameOf(shown, props.communityId),
        target: { user_id: shown },
        values: NONE,
      });
    }
    return rows;
  });

  const members = createMemo(() =>
    membersOf(core.stores.members, props.communityId)
      .map((m) => ({
        id: m.user_id,
        name: core.nameOf(m.user_id, props.communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const change = async (row: Row, key: PermissionKey) => {
    if (pending()) return;
    setPending(row.key);
    setActionError(null);
    try {
      await core.backend.channels.setOverwrite(props.channel.id, row.target, {
        ...row.values,
        [key]: nextChannelPermission(row.values[key]),
      });
      await refetch();
    } catch (cause) {
      setActionError(getErrorMessage(cause, "Couldn't change the permission."));
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => !pending() && props.onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Permissions for ${props.channel.name}`}
        class="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="flex items-start gap-3 border-b border-border px-5 py-4">
          <ShieldCheck size={20} class="mt-0.5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-base font-semibold text-foreground">
              #{props.channel.name} permissions
            </h2>
            <p class="mt-1 text-xs text-muted-foreground">
              Each control cycles through default, allow, and deny. A member's
              exception wins over their roles'.
            </p>
          </div>
          <button
            type="button"
            title="Close"
            disabled={pending() !== null}
            onClick={() => props.onClose()}
            class="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <Show when={actionError() || overwrites.error}>
            <p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError() ??
                getErrorMessage(overwrites.error, "Couldn't load permissions.")}
            </p>
          </Show>
          <Show
            when={overwrites() !== undefined}
            fallback={
              <p class="py-10 text-center text-sm text-muted-foreground">
                Loading channel permissions…
              </p>
            }
          >
            <div class="space-y-6">
              <Section
                title="Roles"
                rows={roleRows()}
                pending={pending()}
                onChange={(row, key) => void change(row, key)}
              />
              <Section
                title="Members"
                rows={memberRows()}
                pending={pending()}
                onChange={(row, key) => void change(row, key)}
              />
              <label class="flex items-center gap-2 text-sm text-body-soft">
                Add an exception for
                <select
                  value=""
                  onChange={(e) => setMemberShown(e.currentTarget.value)}
                  class="rounded border border-border-control bg-surface-input px-2 py-1 text-sm text-foreground"
                >
                  <option value="">a member…</option>
                  <For each={members()}>
                    {(member) => (
                      <option value={member.id}>{member.name}</option>
                    )}
                  </For>
                </select>
              </label>
            </div>
          </Show>
        </div>
        <footer class="flex justify-end border-t border-border px-5 py-3">
          <Button size="sm" onClick={() => props.onClose()}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  rows: Row[];
  pending: string | null;
  onChange: (row: Row, key: PermissionKey) => void;
}) {
  return (
    <section>
      <h3 class="text-sm font-semibold text-foreground">{props.title}</h3>
      <div class="mt-3 overflow-hidden rounded-lg border border-border">
        <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem] gap-2 border-b border-border bg-surface-panel px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span class="text-left">Name</span>
          <For each={COLUMNS}>{(column) => <span>{column.label}</span>}</For>
        </div>
        <For
          each={props.rows}
          fallback={
            <p class="px-3 py-5 text-center text-xs text-muted-foreground">
              None yet.
            </p>
          }
        >
          {(row) => (
            <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span class="truncate text-sm text-foreground">{row.name}</span>
              <For each={COLUMNS}>
                {(column) => (
                  <button
                    type="button"
                    disabled={props.pending !== null}
                    onClick={() => props.onChange(row, column.key)}
                    class="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    classList={{
                      "border-border text-muted-foreground":
                        row.values[column.key] === null,
                      "border-accent-success text-accent-success":
                        row.values[column.key] === true,
                      "border-destructive text-destructive":
                        row.values[column.key] === false,
                    }}
                  >
                    {props.pending === row.key
                      ? "…"
                      : channelPermissionLabel(row.values[column.key])}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
