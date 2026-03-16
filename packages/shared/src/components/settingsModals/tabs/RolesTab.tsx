import React from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import { Skeleton } from "@shared/components/ui/skeleton";
import { Badge } from "@shared/components/ui/badge";
import { Checkbox } from "@shared/components/ui/checkbox";
import type { ServerRoleItem } from "@shared/lib/backend/types";

interface RolesTabProps {
  roleManagementError: string | null;
  roleActionSaving: boolean;
  roleActionError: string | null;
  roleManagementLoading: boolean;
  newRoleName: string;
  newRoleColor: string;
  canManageRoles: boolean;
  onNewColorChange: (color: string) => void;
  onNewNameChange: (name: string) => void;
  onCreateRole: () => Promise<void>;
  roles: ServerRoleItem[];
  selectedRoleId: string | null;
  onSelectRole: (roleId: string | null) => void;
  roleDraft: {
    name: string;
    color: string;
    position: number;
    permissionKeys: string[];
  } | null;
  canEditSelectedRoleDetails: boolean;
  canEditSelectedRolePermissions: boolean;
  canDeleteSelectedRole: boolean;
  onRoleDraftChange: (updatedDraft: {
    name: string;
    color: string;
    position: number;
    permissionKeys: string[];
  }) => void;
  visiblePermissionGroups: {
    scope: string;
    label: string;
    permissions: {
      key: string;
      label: string;
      description: string;
    }[];
  }[];
  onSaveRole: () => Promise<void>;
  onDeleteRole: () => void;
  toggleDraftPermission: (permissionKey: string) => void;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function CreateRoleForm({
  newRoleName,
  newRoleColor,
  canManageRoles,
  roleActionSaving,
  onNewNameChange,
  onNewColorChange,
  onCreateRole,
}: Pick<
  RolesTabProps,
  | "newRoleName"
  | "newRoleColor"
  | "canManageRoles"
  | "roleActionSaving"
  | "onNewNameChange"
  | "onNewColorChange"
  | "onCreateRole"
>) {
  return (
    <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
      <p className="text-sm font-semibold text-white">Create Role</p>
      <Input
        value={newRoleName}
        onChange={(e) => onNewNameChange(e.target.value)}
        placeholder="Role name"
        className="bg-[#101a2b] border-[#304867] text-white"
        disabled={!canManageRoles || roleActionSaving}
      />
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={newRoleColor}
          onChange={(e) => onNewColorChange(e.target.value)}
          className="h-9 w-14 p-1 bg-[#101a2b] border-[#304867]"
          disabled={!canManageRoles || roleActionSaving}
        />
        <Button
          type="button"
          onClick={() => void onCreateRole()}
          disabled={!canManageRoles || roleActionSaving}
          className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
        >
          {roleActionSaving ? "Creating..." : "Create"}
        </Button>
      </div>
      {!canManageRoles && (
        <p className="text-xs text-[#d6a24a]">
          You need Manage Roles to create or edit roles.
        </p>
      )}
    </div>
  );
}

function RoleList({
  roles,
  selectedRoleId,
  onSelectRole,
}: Pick<RolesTabProps, "roles" | "selectedRoleId" | "onSelectRole">) {
  return (
    <div className="scrollbar-inset h-full overflow-y-auto p-2 space-y-1">
      {roles.length === 0 ? (
        <p className="text-sm text-[#a9b8cf] px-2 py-3">No roles found.</p>
      ) : (
        roles.map((role) => {
          const isSelected = role.id === selectedRoleId;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelectRole(role.id)}
              className={`w-full text-left rounded-md px-2 py-2 border transition-colors ${
                isSelected
                  ? "border-[#3f79d8] bg-[#1a2a43]"
                  : "border-transparent hover:border-[#304867] hover:bg-[#17263d]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: role.color }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-white truncate">
                    {role.name}
                  </span>
                </div>
                <span className="text-[11px] text-[#8ea4c7]">
                  {role.position}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function RoleEditor({
  selectedRole,
  roleDraft,
  canEditSelectedRoleDetails,
  canEditSelectedRolePermissions,
  canDeleteSelectedRole,
  roleActionSaving,
  visiblePermissionGroups,
  onRoleDraftChange,
  toggleDraftPermission,
  onSaveRole,
  onDeleteRole,
}: {
  selectedRole: ServerRoleItem | null;
  roleDraft: RolesTabProps["roleDraft"];
  canEditSelectedRoleDetails: boolean;
  canEditSelectedRolePermissions: boolean;
  canDeleteSelectedRole: boolean;
  roleActionSaving: boolean;
  visiblePermissionGroups: RolesTabProps["visiblePermissionGroups"];
  onRoleDraftChange: RolesTabProps["onRoleDraftChange"];
  toggleDraftPermission: RolesTabProps["toggleDraftPermission"];
  onSaveRole: RolesTabProps["onSaveRole"];
  onDeleteRole: RolesTabProps["onDeleteRole"];
}) {
  if (!selectedRole || !roleDraft) {
    return (
      <p className="p-4 text-sm text-[#a9b8cf]">
        Select a role to edit its permissions.
      </p>
    );
  }

  return (
    <>
      <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-white">
            {selectedRole.name}
          </p>
          {selectedRole.isDefault && <Badge variant="outline">Default</Badge>}
          {selectedRole.isSystem && <Badge variant="outline">System</Badge>}
          <Badge variant="outline">{selectedRole.memberCount} members</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Role Name
            </Label>
            <Input
              value={roleDraft.name}
              onChange={(e) =>
                onRoleDraftChange({ ...roleDraft, name: e.target.value })
              }
              className="bg-[#101a2b] border-[#304867] text-white"
              disabled={!canEditSelectedRoleDetails || roleActionSaving}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Color
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={roleDraft.color}
                onChange={(e) =>
                  onRoleDraftChange({ ...roleDraft, color: e.target.value })
                }
                className="h-9 w-14 p-1 bg-[#101a2b] border-[#304867]"
                disabled={!canEditSelectedRoleDetails || roleActionSaving}
              />
              <Input
                value={roleDraft.color}
                onChange={(e) =>
                  onRoleDraftChange({ ...roleDraft, color: e.target.value })
                }
                className="bg-[#101a2b] border-[#304867] text-white"
                disabled={!canEditSelectedRoleDetails || roleActionSaving}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">
              Tier
            </Label>
            <Input
              type="number"
              value={roleDraft.position}
              onChange={(e) =>
                onRoleDraftChange({
                  ...roleDraft,
                  position: Number(e.target.value),
                })
              }
              className="bg-[#101a2b] border-[#304867] text-white"
              disabled={!canEditSelectedRoleDetails || roleActionSaving}
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-[#a9b8cf]">
            Permissions
          </p>
          <p className="text-[11px] text-[#8ea4c7]">
            Reserved internal permissions are hidden from this editor.
          </p>
        </div>

        <div className="space-y-3">
          {visiblePermissionGroups.map((group) => (
            <section
              key={group.scope}
              className="rounded-md border border-[#304867] bg-[#101a2b]"
            >
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#8ea4c7]">
                {group.label}
              </p>
              <div className="divide-y divide-[#233753]">
                {group.permissions.map((permission) => {
                  const checked = roleDraft.permissionKeys.includes(
                    permission.key,
                  );
                  return (
                    <label
                      key={permission.key}
                      className="flex items-start gap-3 p-3 text-sm text-[#e6edf7]"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          toggleDraftPermission(permission.key)
                        }
                        disabled={
                          !canEditSelectedRolePermissions || roleActionSaving
                        }
                      />
                      <span className="space-y-1">
                        <span className="block font-medium text-white">
                          {permission.label}
                        </span>
                        <span className="block text-xs text-[#a9b8cf]">
                          {permission.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 border-t border-[#233753] px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void onDeleteRole()}
          disabled={!canDeleteSelectedRole || roleActionSaving}
          className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
        >
          Delete Role
        </Button>
        <Button
          type="button"
          onClick={() => void onSaveRole()}
          disabled={roleActionSaving || !canEditSelectedRolePermissions}
          className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
        >
          {roleActionSaving ? "Saving..." : "Save Role"}
        </Button>
      </div>
    </>
  );
}

// ── RolesTab ──────────────────────────────────────────────────────────────────

export function RolesTab({
  roleManagementError,
  roleActionSaving,
  roleActionError,
  roleManagementLoading,
  newRoleName,
  newRoleColor,
  canManageRoles,
  onNewColorChange,
  onNewNameChange,
  onCreateRole,
  roles,
  selectedRoleId,
  onSelectRole,
  roleDraft,
  canEditSelectedRoleDetails,
  canEditSelectedRolePermissions,
  canDeleteSelectedRole,
  onRoleDraftChange,
  visiblePermissionGroups,
  onSaveRole,
  onDeleteRole,
  toggleDraftPermission,
}: RolesTabProps) {
  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;

  const editorProps = {
    selectedRole,
    roleDraft,
    canEditSelectedRoleDetails,
    canEditSelectedRolePermissions,
    canDeleteSelectedRole,
    roleActionSaving,
    visiblePermissionGroups,
    onRoleDraftChange,
    toggleDraftPermission,
    onSaveRole,
    onDeleteRole,
  };

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
      <div className="shrink-0 space-y-1">
        <p className="text-sm text-[#a9b8cf]">
          Roles define what people can do community-wide. The database enforces
          permissions using role assignments and role permission entries.
        </p>
        {roleManagementError && (
          <p className="text-sm text-red-400">{roleManagementError}</p>
        )}
        {roleActionError && (
          <p className="text-sm text-red-400">{roleActionError}</p>
        )}
      </div>

      {roleManagementLoading ? (
        <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3"
            >
              <Skeleton className="h-4 w-32 bg-[#22334f]" />
              <Skeleton className="h-10 w-full bg-[#1b2a42]" />
              <Skeleton className="h-10 w-full bg-[#1b2a42]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── Small screen ── */}
          <div className="flex-1 min-h-0 flex flex-col gap-3 md:hidden">
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <CreateRoleForm
                newRoleName={newRoleName}
                newRoleColor={newRoleColor}
                canManageRoles={canManageRoles}
                roleActionSaving={roleActionSaving}
                onNewNameChange={onNewNameChange}
                onNewColorChange={onNewColorChange}
                onCreateRole={onCreateRole}
              />
              <div className="rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
                <RoleList
                  roles={roles}
                  selectedRoleId={selectedRoleId}
                  onSelectRole={onSelectRole}
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
              <RoleEditor {...editorProps} />
            </div>
          </div>

          {/* ── Large screen ── */}
          <div className="hidden md:grid flex-1 min-h-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
            <div className="min-h-0 flex flex-col gap-3">
              <CreateRoleForm
                newRoleName={newRoleName}
                newRoleColor={newRoleColor}
                canManageRoles={canManageRoles}
                roleActionSaving={roleActionSaving}
                onNewNameChange={onNewNameChange}
                onNewColorChange={onNewColorChange}
                onCreateRole={onCreateRole}
              />
              <div className="min-h-0 flex-1 rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
                <RoleList
                  roles={roles}
                  selectedRoleId={selectedRoleId}
                  onSelectRole={onSelectRole}
                />
              </div>
            </div>
            <div className="min-h-0 flex flex-col rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
              <RoleEditor {...editorProps} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
