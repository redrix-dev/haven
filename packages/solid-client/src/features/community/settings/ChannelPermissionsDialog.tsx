import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ShieldCheck, X } from "lucide-solid";
import type { HavenChannel } from "@shared/nexus/community/channelTypes";
import type {
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelRolePermissionItem,
} from "@shared/lib/backend/types";
import { Button } from "@solid-client/components/ui";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import {
  channelPermissionLabel,
  nextChannelPermission,
} from "./channelPermissionControls";

type PermissionKey = keyof ChannelPermissionState;

const permissionColumns: Array<{ key: PermissionKey; label: string }> = [
  { key: "canView", label: "View" },
  { key: "canSend", label: "Send" },
  { key: "canManage", label: "Manage" },
];

export function ChannelPermissionsDialog(props: {
  communityId: string;
  channel: HavenChannel | null;
  onClose: () => void;
}) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const channelId = () => props.channel?.id ?? null;
  const snapshot = core.channels.channelPermissions(channelId);
  const loading = core.channels.channelPermissionsLoading(channelId);
  const loadError = core.channels.channelPermissionsError(channelId);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [pendingRow, setPendingRow] = createSignal<string | null>(null);

  createEffect(() => {
    const channel = props.channel;
    const userId = session()?.user.id;
    if (!channel || !userId) return;
    setActionError(null);
    void core.channels
      .loadChannelPermissions({
        communityId: props.communityId,
        channelId: channel.id,
        userId,
      })
      .catch(() => {
        // The nexus exposes the load error in the dialog.
      });
  });

  const memberRows = createMemo(() => {
    const current = snapshot();
    if (!current) return [];
    const permissions = new Map(
      current.memberPermissions.map((row) => [row.memberId, row]),
    );
    return current.memberOptions.map((option) =>
      memberPermissionRow(option, permissions.get(option.memberId)),
    );
  });

  const saveRole = async (
    row: ChannelRolePermissionItem,
    key: PermissionKey,
  ) => {
    const channel = props.channel;
    if (!channel || pendingRow()) return;
    setPendingRow(`role:${row.roleId}`);
    setActionError(null);
    try {
      await core.channels.saveRoleChannelPermissions({
        communityId: props.communityId,
        channelId: channel.id,
        roleId: row.roleId,
        permissions: {
          canView: row.canView,
          canSend: row.canSend,
          canManage: row.canManage,
          [key]: nextChannelPermission(row[key]),
        },
      });
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Couldn't update role permissions.",
      );
    } finally {
      setPendingRow(null);
    }
  };

  const saveMember = async (
    row: ChannelMemberPermissionItem,
    key: PermissionKey,
  ) => {
    const channel = props.channel;
    if (!channel || pendingRow()) return;
    setPendingRow(`member:${row.memberId}`);
    setActionError(null);
    try {
      await core.channels.saveMemberChannelPermissions({
        communityId: props.communityId,
        channelId: channel.id,
        memberId: row.memberId,
        permissions: {
          canView: row.canView,
          canSend: row.canSend,
          canManage: row.canManage,
          [key]: nextChannelPermission(row[key]),
        },
      });
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Couldn't update member permissions.",
      );
    } finally {
      setPendingRow(null);
    }
  };

  return (
    <Show when={props.channel} keyed>
      {(channel) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={() => !pendingRow() && props.onClose()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Permissions for ${channel.name}`}
            class="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header class="flex items-start gap-3 border-b border-border px-5 py-4">
              <ShieldCheck size={20} class="mt-0.5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-base font-semibold text-foreground">
                  #{channel.name} permissions
                </h2>
                <p class="mt-1 text-xs text-muted-foreground">
                  Each control cycles through default, allow, and deny.
                </p>
              </div>
              <button
                type="button"
                title="Close"
                disabled={pendingRow() !== null}
                onClick={props.onClose}
                class="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-5">
              <Show when={loadError() || actionError()}>
                <p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {actionError() || loadError()}
                </p>
              </Show>

              <Show
                when={!loading()}
                fallback={
                  <p class="py-10 text-center text-sm text-muted-foreground">
                    Loading channel permissions…
                  </p>
                }
              >
                <Show
                  when={snapshot()}
                  fallback={
                    <div class="py-10 text-center">
                      <p class="text-sm text-muted-foreground">
                        Channel permissions aren't available.
                      </p>
                      <Button
                        class="mt-3"
                        size="sm"
                        onClick={() => {
                          const userId = session()?.user.id;
                          if (!userId) return;
                          void core.channels
                            .loadChannelPermissions({
                              communityId: props.communityId,
                              channelId: channel.id,
                              userId,
                            })
                            .catch(() => {
                              // The nexus exposes the retry error above.
                            });
                        }}
                      >
                        Retry
                      </Button>
                    </div>
                  }
                >
                  {(permissions) => (
                    <div class="space-y-6">
                      <PermissionSection
                        title="Role overrides"
                        description="Role defaults apply when an override is set to Default."
                        rows={permissions().rolePermissions}
                        rowKey={(row) => row.roleId}
                        rowName={(row) => row.name}
                        rowDisabled={(row) =>
                          !row.editable || pendingRow() !== null
                        }
                        pendingKey={pendingRow()}
                        keyPrefix="role"
                        onChange={saveRole}
                      />
                      <PermissionSection
                        title="Member overrides"
                        description="Member overrides take precedence over their role settings."
                        rows={memberRows()}
                        rowKey={(row) => row.memberId}
                        rowName={(row) => row.displayName}
                        rowDisabled={(row) =>
                          row.isOwner || pendingRow() !== null
                        }
                        pendingKey={pendingRow()}
                        keyPrefix="member"
                        onChange={saveMember}
                      />
                    </div>
                  )}
                </Show>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

function PermissionSection<T extends ChannelPermissionState>(props: {
  title: string;
  description: string;
  rows: T[];
  rowKey: (row: T) => string;
  rowName: (row: T) => string;
  rowDisabled: (row: T) => boolean;
  pendingKey: string | null;
  keyPrefix: "role" | "member";
  onChange: (row: T, key: PermissionKey) => Promise<void>;
}) {
  return (
    <section>
      <h3 class="text-sm font-semibold text-foreground">{props.title}</h3>
      <p class="mt-1 text-xs text-muted-foreground">{props.description}</p>
      <div class="mt-3 overflow-hidden rounded-lg border border-border">
        <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem] gap-2 border-b border-border bg-surface-panel px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span class="text-left">Name</span>
          <For each={permissionColumns}>
            {(column) => <span>{column.label}</span>}
          </For>
        </div>
        <For
          each={props.rows}
          fallback={
            <p class="px-3 py-5 text-center text-xs text-muted-foreground">
              No {props.title.toLowerCase()} available.
            </p>
          }
        >
          {(row) => {
            const id = () => props.rowKey(row);
            const disabled = () => props.rowDisabled(row);
            return (
              <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem] items-center gap-2 border-b border-border px-3 py-3 last:border-b-0">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-foreground">
                    {props.rowName(row)}
                  </p>
                  <Show when={disabled() && props.pendingKey === null}>
                    <p class="text-[11px] text-muted-foreground">
                      Not editable
                    </p>
                  </Show>
                </div>
                <For each={permissionColumns}>
                  {(column) => (
                    <PermissionButton
                      value={row[column.key]}
                      label={`${column.label} for ${props.rowName(row)}`}
                      disabled={disabled()}
                      pending={
                        props.pendingKey === `${props.keyPrefix}:${id()}`
                      }
                      onClick={() => void props.onChange(row, column.key)}
                    />
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}

function PermissionButton(props: {
  value: boolean | null;
  label: string;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      class="rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
      classList={{
        "border-border bg-surface-input text-muted-foreground":
          props.value === null,
        "border-primary/50 bg-primary/10 text-primary": props.value === true,
        "border-destructive/50 bg-destructive/10 text-destructive":
          props.value === false,
      }}
    >
      {props.pending ? "Saving…" : channelPermissionLabel(props.value)}
    </button>
  );
}

function memberPermissionRow(
  option: ChannelMemberOption,
  existing?: ChannelMemberPermissionItem,
): ChannelMemberPermissionItem {
  return (
    existing ?? {
      ...option,
      canView: null,
      canSend: null,
      canManage: null,
    }
  );
}
