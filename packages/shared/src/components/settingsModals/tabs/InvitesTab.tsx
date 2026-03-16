import React, { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Skeleton } from "@shared/components/ui/skeleton";
import type { ServerInviteItem } from "../../ServerSettingsModal";

interface InvitesTabProps {
  canManageInvites: boolean;
  invites: ServerInviteItem[];
  invitesLoading: boolean;
  invitesError: string | null;
  inviteActionError: string | null;
  inviteBaseUrl: string;
  onCreateInvite: (values: {
    maxUses: number | null;
    expiresInHours: number | null;
  }) => Promise<ServerInviteItem>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
}

export function InvitesTab({
  canManageInvites,
  invites,
  invitesLoading,
  invitesError,
  inviteActionError,
  inviteBaseUrl,
  onCreateInvite,
  onRevokeInvite,
}: InvitesTabProps) {
  const [inviteMaxUsesInput, setInviteMaxUsesInput] = useState("");
  const [inviteExpiryHoursInput, setInviteExpiryHoursInput] = useState("1");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const parsePositiveIntegerOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numericValue = Number(trimmed);
    if (!Number.isInteger(numericValue) || numericValue <= 0) return null;
    return numericValue;
  };

  const copyInviteLink = async (inviteCode: string, inviteId: string) => {
    const link = `${inviteBaseUrl}${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(inviteId);
      setTimeout(
        () =>
          setCopiedInviteId((current) =>
            current === inviteId ? null : current,
          ),
        1200,
      );
    } catch {
      // clipboard failed silently
    }
  };

  const handleCreateInvite = async () => {
    const maxUses = parsePositiveIntegerOrNull(inviteMaxUsesInput);
    const parsedExpiresInHours = parsePositiveIntegerOrNull(
      inviteExpiryHoursInput,
    );
    const expiresInHours = parsedExpiresInHours ?? 1;
    setInviteCreating(true);
    try {
      const invite = await onCreateInvite({ maxUses, expiresInHours });
      await copyInviteLink(invite.code, invite.id);
    } catch {
      // error handled by parent via inviteActionError prop
    } finally {
      setInviteCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await onRevokeInvite(inviteId);
    } catch {
      // error handled by parent via inviteActionError prop
    }
  };
  return (
    <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4">
      <h3 className="text-white font-semibold">Invite Links</h3>
      <p className="text-sm text-[#a9b8cf]">
        Create and share invite links for this community.
      </p>

      {canManageInvites ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={inviteMaxUsesInput}
              onChange={(e) => setInviteMaxUsesInput(e.target.value)}
              placeholder="Max uses (blank = unlimited)"
              className="bg-[#142033] border-[#304867] text-white"
            />
            <Input
              value={inviteExpiryHoursInput}
              onChange={(e) => setInviteExpiryHoursInput(e.target.value)}
              placeholder="Expires in hours (blank = 1 hour)"
              className="bg-[#142033] border-[#304867] text-white"
            />
            <Button
              type="button"
              onClick={() => void handleCreateInvite()}
              disabled={inviteCreating}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {inviteCreating ? "Creating..." : "Create Invite"}
            </Button>
          </div>
          <p className="text-xs text-[#8ea4c7]">
            Invite expiry defaults to 1 hour unless you enter a different value.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[#d6a24a]">
          You can view active invites, but only members with Manage Invites can
          create or revoke them.
        </p>
      )}

      {inviteActionError && (
        <p className="text-sm text-red-400">{inviteActionError}</p>
      )}
      {invitesError && <p className="text-sm text-red-400">{invitesError}</p>}

      {invitesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-md bg-[#142033] p-3 space-y-2">
              <Skeleton className="h-4 w-full bg-[#22334f]" />
              <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
            </div>
          ))}
        </div>
      ) : invites.length === 0 ? (
        <p className="text-sm text-[#a9b8cf]">No active invites.</p>
      ) : (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="bg-[#142033] rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm break-all">
                  {`${inviteBaseUrl}${invite.code}`}
                </p>
                <p className="text-xs text-[#a9b8cf] mt-1">
                  Uses: {invite.currentUses}
                  {invite.maxUses ? ` / ${invite.maxUses}` : " / unlimited"}
                  {" | "}
                  Expires:{" "}
                  {invite.expiresAt
                    ? new Date(invite.expiresAt).toLocaleString()
                    : "never"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void copyInviteLink(invite.code, invite.id)}
                  className="text-white hover:bg-[#22334f]"
                >
                  {copiedInviteId === invite.id ? "Copied" : "Copy"}
                </Button>
                {canManageInvites && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleRevokeInvite(invite.id)}
                    className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
