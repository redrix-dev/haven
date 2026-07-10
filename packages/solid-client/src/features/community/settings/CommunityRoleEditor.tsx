import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { Plus, Trash2 } from "lucide-solid";
import { requireHavenSolidCore } from "@solid-client/core";
import { ConfirmDialog } from "@solid-client/components/ui";
import { buildVisiblePermissionGroups } from "@shared/features/permissions/communityPermissionMeta";
import type {
  PermissionCatalogItem,
  ServerRoleItem,
} from "@shared/lib/backend/types";

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
 * Community role list + editor. Used inside the settings panel and as a
 * standalone full-page surface for deep links.
 */
export function CommunityRoleEditor(props: { communityId: string }) {
  const core = requireHavenSolidCore();
  const communityId = () => props.communityId;

  const snapshot = core.admin.roleSnapshot(communityId);
  const loading = core.admin.roleManagementLoading(communityId);
  const canManageRoles = () =>
    core.permissions.getPermissions(communityId()).canManageRoles;
  const myUserId = core.authStore.getState().user?.id ?? null;
  const isOwner = () =>
    snapshot()?.members.find((member) => member.userId === myUserId)?.isOwner ??
    false;

  const [selectedRoleId, setSelectedRoleId] = createSignal<string | null>(null);

  onMount(() => {
    void core.ensureCommunityPermissions(communityId());
    void core.admin.loadRoleManagement(communityId());
  });

  const roles = () => snapshot()?.roles ?? [];
  const catalog = () => snapshot()?.permissionsCatalog ?? [];
  const selectedRole = createMemo(
    () => roles().find((role) => role.id === selectedRoleId()) ?? null,
  );

  const createRole = () => {
    void core.admin
      .createRole({
        communityId: communityId(),
        name: "New Role",
        color: ROLE_COLORS[0],
        position: roles().length,
      })
      .catch((err) =>
        console.warn("[CommunityRoleEditor] createRole failed", err),
      );
  };

  return (
    <Show
      when={canManageRoles()}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          You don't have permission to manage roles.
        </div>
      }
    >
      <div class="flex h-full min-h-0">
        <div class="flex w-56 shrink-0 flex-col border-r border-border">
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Roles
            </span>
            <button
              type="button"
              title="New role"
              onClick={() => createRole()}
              class="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Plus size={16} />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <Show
              when={!loading() || roles().length > 0}
              fallback={
                <p class="px-1 text-sm text-muted-foreground">Loading…</p>
              }
            >
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
                    <span class="min-w-0 flex-1 truncate">{role.name}</span>
                    <span class="shrink-0 text-xs text-muted-foreground">
                      {role.memberCount}
                    </span>
                  </button>
                )}
              </For>
            </Show>
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
                catalog={catalog()}
                isOwner={isOwner()}
                communityId={communityId()}
                onDeleted={() => setSelectedRoleId(null)}
              />
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
}

function RoleEditor(props: {
  role: ServerRoleItem;
  catalog: PermissionCatalogItem[];
  isOwner: boolean;
  communityId: string;
  onDeleted: () => void;
}) {
  const core = requireHavenSolidCore();
  const [name, setName] = createSignal(props.role.name);
  const [color, setColor] = createSignal(props.role.color);
  const [keys, setKeys] = createSignal<string[]>([
    ...props.role.permissionKeys,
  ]);
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const canEditDetails =
    !props.role.isDefault && (!props.role.isSystem || props.isOwner);
  const canEditPermissions = !props.role.isSystem || props.isOwner;
  const canDelete =
    !props.role.isDefault && (!props.role.isSystem || props.isOwner);

  const groups = createMemo(() => buildVisiblePermissionGroups(props.catalog));

  const toggle = (key: string) =>
    setKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await core.admin.saveRole({
        communityId: props.communityId,
        roleId: props.role.id,
        position: props.role.position,
        details: canEditDetails
          ? { name: name().trim() || props.role.name, color: color() }
          : null,
        permissionKeys: canEditPermissions ? keys() : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await core.admin.deleteRole({
        communityId: props.communityId,
        roleId: props.role.id,
      });
      setConfirmDelete(false);
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete role.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
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
          {props.role.name}
        </h2>
        <Show when={props.role.isDefault}>
          <span class="text-xs text-muted-foreground">Default</span>
        </Show>
        <Show when={props.role.isSystem && !props.role.isDefault}>
          <span class="text-xs text-muted-foreground">System</span>
        </Show>
      </div>

      <Show
        when={canEditDetails}
        fallback={
          <p class="mb-5 text-sm text-muted-foreground">
            {props.role.isSystem
              ? "System role details are fixed."
              : props.role.isDefault
                ? "The default role's name and color are fixed."
                : "You can't edit this role."}
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
              class="w-full rounded border border-input bg-surface-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
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

      <h3 class="mb-1 text-xs font-semibold uppercase text-muted-foreground">
        Permissions
      </h3>
      <Show when={!canEditPermissions}>
        <p class="mb-3 text-xs text-muted-foreground">
          Read-only — you can't change this role's permissions.
        </p>
      </Show>

      <For each={groups()}>
        {(group) => (
          <div class="mb-5">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div class="space-y-1.5">
              <For each={group.permissions}>
                {(perm) => (
                  <div class="flex items-center justify-between rounded-lg border border-border bg-surface-panel px-3 py-2.5">
                    <div class="min-w-0 flex-1 pr-3">
                      <p class="text-sm text-foreground">{perm.label}</p>
                      <Show when={perm.description}>
                        <p class="text-xs text-muted-foreground">
                          {perm.description}
                        </p>
                      </Show>
                    </div>
                    <PermissionSwitch
                      checked={keys().includes(perm.key)}
                      disabled={!canEditPermissions || saving()}
                      onToggle={() => toggle(perm.key)}
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </For>

      <Show when={error()}>
        <p class="mb-3 text-sm text-destructive">{error()}</p>
      </Show>

      <div class="flex items-center gap-3">
        <Show when={canEditDetails || canEditPermissions}>
          <button
            type="button"
            disabled={saving()}
            onClick={() => void save()}
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving() ? "Saving…" : "Save role"}
          </button>
        </Show>
        <Show when={canDelete}>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            class="flex items-center gap-1 rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-primary-foreground"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </Show>
      </div>

      <ConfirmDialog
        open={confirmDelete()}
        title={`Delete "${props.role.name}"?`}
        description="This removes the role from every member."
        confirmLabel="Delete"
        danger
        pending={deleting()}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function PermissionSwitch(props: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onToggle()}
      class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50"
      classList={{
        "bg-primary": props.checked,
        "bg-surface-input": !props.checked,
      }}
    >
      <span
        class="absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all"
        classList={{ "left-[18px]": props.checked, "left-0.5": !props.checked }}
      />
    </button>
  );
}
