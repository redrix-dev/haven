import React from 'react';
import { Button } from '@shared/components/ui/button';
import { Skeleton } from '@shared/components/ui/skeleton';
import type { CommunityBanItem } from '@shared/lib/backend/types';

interface BansTabProps {
  bans: CommunityBanItem[];
  bansLoading: boolean;
  bansError: string | null;
  canManageBans: boolean;
  unbanBusyUserId: string | null;
  unbanActionError: string | null;
  onUnban: (targetUserId: string, username: string) => void;
}

export function BansTab({
  bans,
  bansLoading,
  bansError,
  canManageBans,
  unbanBusyUserId,
  unbanActionError,
  onUnban,
}: BansTabProps) {
  return (
    <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4">
      <h3 className="text-white font-semibold">Banned Users</h3>
      <p className="text-sm text-[#a9b8cf]">
        Active bans for this community. Each entry includes who was banned, when, and the ban description.
      </p>

      {!canManageBans && (
        <p className="text-xs text-[#d6a24a]">
          You can view bans, but only members with Manage Bans can unban users.
        </p>
      )}

      {bansError && <p className="text-sm text-red-400">{bansError}</p>}
      {unbanActionError && <p className="text-sm text-red-400">{unbanActionError}</p>}

      {bansLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3 space-y-2">
              <Skeleton className="h-4 w-28 bg-[#22334f]" />
              <Skeleton className="h-3 w-40 bg-[#1b2a42]" />
              <Skeleton className="h-8 w-20 bg-[#22334f]" />
            </div>
          ))}
        </div>
      ) : bans.length === 0 ? (
        <p className="text-sm text-[#a9b8cf]">No active bans.</p>
      ) : (
        <div className="space-y-2">
          {bans.map((ban) => (
            <div
              key={ban.id}
              className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3 flex flex-col gap-2"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-white">{ban.username}</p>
                <p className="text-[11px] text-[#8ea4c7]">
                  Banned on {new Date(ban.bannedAt).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-[#d4def0] whitespace-pre-wrap">{ban.reason}</p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onUnban(ban.bannedUserId, ban.username)}
                  disabled={!canManageBans || unbanBusyUserId === ban.bannedUserId}
                  className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                >
                  {unbanBusyUserId === ban.bannedUserId ? 'Unbanning...' : 'Unban'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}