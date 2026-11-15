import { For, Show, createMemo, createSignal } from "solid-js";
import { Plus } from "lucide-solid";
import type { Permission, Role } from "@shared/lib/backend/records";
import { rolesOf, rolesOfMember } from "@shared/collections/roles/selectors";
import { membersOf } from "@shared/collections/members/selectors";
import { memberKey } from "@shared/collections/members/members";
import { permissionGroups } from "@shared/features/permissions/permissionCatalog";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenSolidCore } from "@solid-client/core";
import { ConfirmDialog } from "@solid-client/components/ui";

export const ROLE_COLORS = [
  "#99aab5",
  "#f04747",
  "#faa61a",
  "#43b581",
  "#3f79d8",
  "#9b59b6",
  "#e91e63",
  "#1abc9c",
];

/**
 * A community's roles, highest first, for those with `manage_roles`: what
 * each allows and who holds it. The database refuses anything at or above
 * the person's own rank, and says so; what a role allows comes back with the
 * reload `access.changed` asks for.
 */
export function CommunityRoleEditor(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const roles = createMemo(() => rolesOf(core.stores.roles, props.communityId));
  const [selectedRoleId, setSelectedRoleId] = createSignal<string | null>(null);
  const selectedRole = () =>
    roles().find((role) => role.id === selectedRoleId()) ?? null;
  const [error, setError] = createSignal<string | null>(null);

  const holders = (roleId: string) =>
    Object.entries(core.stores.roles.held).filter(
      ([key, ids]) =>
        key.startsWith(`${props.communityId}:`) && ids.includes(roleId),
    ).length;

  const createRole = async () => {
    setError(null);
    try {
      const role = await core.roles.create(props.communityId, "New role", {
        color: ROLE_COLORS[0],
      });
      setSelectedRoleId(role.id);
    } catch (cause) {
      setError(getErrorMessage(cause, "Couldn't create the role."));
    }
  };

  return (
    <div class="flex h-full min-h-0">
      <div class="flex w-56 shrink-0 flex-col border-r border-border">
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Roles
          </span>
          <button
            type="button"
            title="New role"
            onClick={() => void createRole()}
            class="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        </div>
        <Show when={error()}>
          <p class="px-3 pb-2 text-xs text-destructive">{error()}</p>
        </Show>
        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <For each={roles()}>
            {(role) => (
              <button
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors"
                classList={{
                  "bg-surface-row-selected text-foreground":
                    selectedRoleId() === role.id,
                  "text-body-soft hover:bg-surface-list-hover":
                    selectedRoleId() !== role.id,
                }}
              >
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ "background-color": role.color }}
                />
                <span class="min-w-0 flex-1 truncate">
                  {role.is_everyone ? "@everyone" : role.name}
                </span>
                <Show when={!role.is_everyone}>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {holders(role.id)}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show
          when={selectedRole()}
          keyed
          fallback={
            <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a role to edit.
            </div>
          }
        >
          {(role) => (
            <RoleEditor
              role={role}
              communityId={props.communityId}
              onDeleted={() => setSelectedRoleId(null)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

function RoleEditor(props: {
  role: Role;
  communityId: string;
  onDeleted: () => void;
}) {
  const core = requireHavenSolidCore();
  const [name, setName] = createSignal(props.role.name);
  const [color, setColor] = createSignal(props.role.color);
  const [keys, setKeys] = createSignal<Permission[]>([
    ...(core.stores.roles.permissions[props.role.id] ?? []),
  ]);
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const groups = permissionGroups();

  const toggle = (key: Permission) =>
    setKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!props.role.is_everyone) {
        await core.roles.update(props.role.id, {
          name: name().trim() || props.role.name,
          color: color(),
        });
      }
      await core.roles.setPermissions(props.role.id, keys());
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't save the role."));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await core.roles.remove(props.role.id);
      setConfirmDelete(false);
      props.onDeleted();
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't delete the role."));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const members = createMemo(() =>
    membersOf(core.stores.members, props.communityId)
      .map((m) => ({
        id: m.user_id,
        name: core.nameOf(m.user_id, props.communityId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const holds = (userId: string) =>
    (
      core.stores.roles.held[memberKey(props.communityId, userId)] ?? []
    ).includes(props.role.id);
  const setHolds = async (userId: string, on: boolean) => {
    setError(null);
    const current = rolesOfMember(
      core.stores.roles,
      props.communityId,
      userId,
    ).map((r) => r.id);
    const next = on
      ? [...new Set([...current, props.role.id])]
      : current.filter((id) => id !== props.role.id);
    try {
      await core.roles.setMemberRoles(props.communityId, userId, next);
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't change their roles."));
    }
  };

  return (
    <div class="mx-auto max-w-2xl p-6">
      <div class="mb-5 flex items-center gap-2">
        <span
          class="h-3.5 w-3.5 rounded-full"
          style={{ "background-color": color() }}
        />
        <h2 class="flex-1 text-lg font-semibold text-foreground">
          {props.role.is_everyone ? "@everyone" : props.role.name}
        </h2>
      </div>

      <Show when={error()}>
        <p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error()}
        </p>
      </Show>

      <Show
        when={!props.role.is_everyone}
        fallback={
          <p class="mb-5 text-sm text-muted-foreground">
            Everyone in the community holds this role. What it allows, every
            member may do.
          </p>
        }
      >
        <div class="mb-6 space-y-3">
          <div>
            <label class="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Role name
            </label>
            <input
              value={name()}
              disabled={saving()}
              onInput={(event) => setName(event.currentTarget.value)}
              class="w-full rounded border border-input bg-surface-input px-3 py-2 text-sm text-foreground outline-hidden focus:border-primary"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Color
            </label>
            <div class="flex flex-wrap gap-2">
              <For each={ROLE_COLORS}>
                {(swatch) => (
                  <button
                    type="button"
                    disabled={saving()}
                    onClick={() => setColor(swatch)}
                    class="flex h-8 w-8 items-center justify-center rounded-full border-2"
                    classList={{
                      "border-foreground": color() === swatch,
                      "border-transparent": color() !== swatch,
                    }}
                  >
                    <span
                      class="h-6 w-6 rounded-full"
                      style={{ "background-color": swatch }}
                    />
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <h3 class="mb-3 text-xs font-semibold uppercase text-muted-foreground">
        Permissions
      </h3>
      <For each={groups}>
        {(group) => (
          <div class="mb-5">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div class="space-y-1.5">
              <For each={group.permissions}>
                {(perm) => (
                  <label class="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface-panel px-3 py-2.5">
                    <div class="min-w-0 flex-1 pr-3">
                      <p class="text-sm text-foreground">{perm.label}</p>
                      <p class="text-xs text-muted-foreground">
                        {perm.description}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={keys().includes(perm.key)}
                      disabled={saving()}
                      onChange={() => toggle(perm.key)}
                      class="h-4 w-4 accent-primary"
                    />
                  </label>
                )}
              </For>
            </div>
          </div>
        )}
      </For>

      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled={saving()}
          onClick={() => void save()}
          class="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving() ? "Saving…" : "Save role"}
        </button>
        <Show when={!props.role.is_everyone}>
          <button
            type="button"
            disabled={deleting()}
            onClick={() => setConfirmDelete(true)}
            class="rounded px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            Delete role
          </button>
        </Show>
      </div>

      <Show when={!props.role.is_everyone}>
        <h3 class="mb-2 mt-8 text-xs font-semibold uppercase text-muted-foreground">
          Members with this role
        </h3>
        <div class="space-y-1">
          <For each={members()}>
            {(member) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-body-soft hover:bg-surface-list-hover">
                <input
                  type="checkbox"
                  checked={holds(member.id)}
                  onChange={(e) =>
                    void setHolds(member.id, e.currentTarget.checked)
                  }
                  class="h-4 w-4 accent-primary"
                />
                {member.name}
              </label>
            )}
          </For>
        </div>
      </Show>

      <ConfirmDialog
        open={confirmDelete()}
        title={`Delete ${props.role.name}?`}
        description="Everyone who holds it loses what it allows."
        confirmLabel="Delete"
        danger
        pending={deleting()}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
