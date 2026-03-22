import React, { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Skeleton } from "@shared/components/ui/skeleton";
import { Checkbox } from "@shared/components/ui/checkbox";
import { Badge } from "@shared/components/ui/badge";
import type {
  ServerRoleItem,
  ServerMemberRoleItem,
} from "@shared/lib/backend/types";
interface MembersTabProps {
  members: ServerMemberRoleItem[];
  roles: ServerRoleItem[];
  defaultRoleId: string | null;
  onSelectedMemberId: (memberId: string) => void;
  selectedMemberId: string | null;
  memberDraftRoleIds: string[];
  roleManagementLoading: boolean;
  roleManagementError: string | null;
  memberActionSaving: boolean;
  memberActionError: string | null;
  canManageMembers: boolean;
  canManageRoles: boolean;
  isOwner: boolean;
  onToggleMemberRole: (roleId: string) => void;
  onSaveMemberRoles: () => Promise<void>;
}

export function MembersTab({
  members,
  roles,
  defaultRoleId,
  onSelectedMemberId,
  selectedMemberId,
  memberDraftRoleIds,
  roleManagementLoading,
  roleManagementError,
  memberActionSaving,
  memberActionError,
  canManageMembers,
  canManageRoles,
  isOwner,
  onToggleMemberRole,
  onSaveMemberRoles,
}: MembersTabProps) {
  const [memberSearch, setMemberSearch] = useState("");
  const filteredMembers = members.filter(
    (member) =>
      member.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      member.userId.toLowerCase().includes(memberSearch.toLowerCase()),
  );
  const selectedMember =
    members.find((m) => m.memberId === selectedMemberId) || null;
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
      <div className="shrink-0 space-y-1">
        <p className="text-sm text-[#a9b8cf]">
          Assign roles to members. Role assignments are stored in the database
          and enforced by role-based permission checks.
        </p>
        {roleManagementError && (
          <p className="text-sm text-red-400">{roleManagementError}</p>
        )}
        {memberActionError && (
          <p className="text-sm text-red-400">{memberActionError}</p>
        )}
      </div>

      {roleManagementLoading ? (
        <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          <Skeleton className="h-10 w-full bg-[#22334f]" />
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-md border border-[#304867] bg-[#142033] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32 bg-[#22334f]" />
                  <Skeleton className="h-3 w-24 bg-[#1b2a42]" />
                </div>
                <Skeleton className="h-8 w-24 bg-[#22334f]" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          {/* Left: search + member list */}
          <div className="min-h-0 flex flex-col gap-3">
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search community members..."
              className="shrink-0 bg-[#142033] border-[#304867] text-white"
            />
            <div className="min-h-0 flex-1 rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
              <div className="scrollbar-inset h-full overflow-y-auto p-2 space-y-1">
                {filteredMembers.length === 0 ? (
                  <p className="text-sm text-[#a9b8cf] px-2 py-3">
                    No matching members.
                  </p>
                ) : (
                  filteredMembers.map((member) => {
                    const isSelected = member.memberId === selectedMemberId;
                    return (
                      <button
                        key={member.memberId}
                        type="button"
                        onClick={() => onSelectedMemberId(member.memberId)}
                        className={`w-full text-left rounded-md px-2 py-2 border transition-colors ${
                          isSelected
                            ? "border-[#3f79d8] bg-[#1a2a43]"
                            : "border-transparent hover:border-[#304867] hover:bg-[#17263d]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {member.displayName}
                            </p>
                            <p className="text-[11px] text-[#8ea4c7] truncate">
                              {member.userId}
                            </p>
                          </div>
                          {member.isOwner && (
                            <Badge variant="outline">Owner</Badge>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: member editor with pinned footer */}
          <div className="min-h-0 flex flex-col rounded-md border border-[#304867] bg-[#142033] overflow-hidden">
            {!selectedMember ? (
              <p className="p-4 text-sm text-[#a9b8cf]">
                Select a member to assign roles.
              </p>
            ) : (
              <>
                {/* Scrollable editor content */}
                <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {selectedMember.displayName}
                    </p>
                    <p className="text-xs text-[#8ea4c7] mt-1">
                      {selectedMember.userId}
                    </p>
                  </div>

                  {selectedMember.isOwner ? (
                    <p className="text-xs text-[#d6a24a]">
                      Owner membership is fixed and cannot be changed here.
                    </p>
                  ) : !canManageRoles ? (
                    <p className="text-xs text-[#d6a24a]">
                      You need Manage Roles to change member role assignments.
                    </p>
                  ) : canManageMembers ? null : (
                    <p className="text-xs text-[#8ea4c7]">
                      Manage Members is available, but role assignment is
                      controlled by Manage Roles.
                    </p>
                  )}

                  <div className="divide-y divide-[#233753] rounded-md border border-[#304867] overflow-hidden">
                    {roles.map((role) => {
                      const checked =
                        memberDraftRoleIds.includes(role.id) ||
                        (defaultRoleId !== null && role.id === defaultRoleId);
                      const disabled =
                        !canManageRoles ||
                        selectedMember.isOwner ||
                        role.id === defaultRoleId ||
                        (role.isSystem && !isOwner);
                      return (
                        <label
                          key={role.id}
                          className="flex items-center justify-between gap-3 p-3 text-sm text-[#e6edf7]"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-block size-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: role.color,
                              }}
                              aria-hidden
                            />
                            <span className="truncate text-white">
                              {role.name}
                            </span>
                            {role.isDefault && (
                              <Badge variant="outline">Default</Badge>
                            )}
                            {role.isSystem && (
                              <Badge variant="outline">System</Badge>
                            )}
                          </span>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => onToggleMemberRole(role.id)}
                            disabled={disabled || memberActionSaving}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Pinned footer */}
                <div className="shrink-0 flex justify-end border-t border-[#233753] px-4 py-3">
                  <Button
                    type="button"
                    onClick={() => void onSaveMemberRoles()}
                    disabled={
                      !canManageRoles ||
                      selectedMember.isOwner ||
                      memberActionSaving
                    }
                    className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                  >
                    {memberActionSaving ? "Saving..." : "Save Member Roles"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
