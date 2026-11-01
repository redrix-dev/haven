import type { ServerRoleManagementSnapshot } from "@shared/lib/backend/types";

/** Mirrors hierarchy for menu visibility. The RPC remains authoritative. */
export function isVoiceTargetBelowViewer(
  snapshot: ServerRoleManagementSnapshot | null,
  viewerId: string,
  targetId: string,
): boolean {
  if (!snapshot || viewerId === targetId) return false;
  const viewer = snapshot.members.find((member) => member.userId === viewerId);
  const target = snapshot.members.find((member) => member.userId === targetId);
  if (!viewer || !target || target.isOwner) return false;
  if (viewer.isOwner) return true;
  const position = (roleIds: string[]) =>
    Math.max(
      -2147483648,
      ...snapshot.roles
        .filter((role) => roleIds.includes(role.id))
        .map((role) => role.position),
    );
  return position(target.roleIds) < position(viewer.roleIds);
}
