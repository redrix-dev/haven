import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ActionMenuContent } from '@/components/menus/ActionMenuContent';
import type { BanEligibleServer } from '@/lib/backend/types';
import type { MenuActionNode } from '@/lib/contextMenu/types';
import { resolveContextMenuIntent } from '@/lib/contextMenu';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';

export interface ProfileActionSurfaceProps {
  userId: string;
  username: string;
  avatarUrl: string | null;
  canReport: boolean;
  canBan: boolean;
  onDirectMessage: (userId: string) => void;
  onReport: (userId: string) => void;
  onBan: (userId: string, communityId: string) => void;
  resolveBanServers: (userId: string) => Promise<BanEligibleServer[]>;
  children: React.ReactNode;
}

export function ProfileActionSurface({
  userId,
  username,
  avatarUrl,
  canReport,
  canBan,
  onDirectMessage,
  onReport,
  onBan,
  resolveBanServers,
  children,
}: ProfileActionSurfaceProps) {
  const [open, setOpen] = React.useState(false);
  const [banServers, setBanServers] = React.useState<BanEligibleServer[]>([]);
  const [banServersLoading, setBanServersLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !canBan) return;

    let isMounted = true;
    setBanServersLoading(true);
    void resolveBanServers(userId)
      .then((servers) => {
        if (!isMounted) return;
        setBanServers(servers);
      })
      .catch(() => {
        if (!isMounted) return;
        setBanServers([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setBanServersLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [canBan, open, resolveBanServers, userId]);

  const avatarInitial = username.trim().charAt(0).toUpperCase() || 'U';

  const actions = React.useMemo<MenuActionNode[]>(() => {
    const next: MenuActionNode[] = [
      {
        kind: 'separator',
        key: 'header-separator',
      },
      {
        kind: 'item',
        key: 'direct-message',
        label: 'Direct Message',
        onSelect: () => onDirectMessage(userId),
      },
      {
        kind: 'item',
        key: 'report',
        label: 'Report',
        disabled: !canReport,
        onSelect: () => onReport(userId),
      },
    ];

    if (canBan) {
      const banItems: MenuActionNode[] = banServersLoading
        ? [
            {
              kind: 'item',
              key: 'ban-loading',
              label: 'Loading servers...',
              disabled: true,
              onSelect: () => undefined,
            },
          ]
        : banServers.length === 0
          ? [
              {
                kind: 'item',
                key: 'ban-none',
                label: 'No eligible servers',
                disabled: true,
                onSelect: () => undefined,
              },
            ]
          : banServers.map((server) => ({
              kind: 'item',
              key: `ban-${server.communityId}`,
              label: server.communityName,
              onSelect: () => onBan(userId, server.communityId),
            }));

      next.push({
        kind: 'submenu',
        key: 'ban',
        label: 'Ban',
        items: banItems,
      });
    }

    return next;
  }, [banServers, banServersLoading, canBan, canReport, onBan, onDirectMessage, onReport, userId]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        traceContextMenuEvent('profile', 'open-change', { userId, open: nextOpen });
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          data-menu-scope="profile"
          className="inline-flex max-w-full cursor-pointer"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onContextMenu={(event) => {
            const intent = resolveContextMenuIntent(event.target);
            traceContextMenuEvent('profile', 'contextmenu-trigger', { intent, userId });
            if (intent === 'native_text') {
              event.stopPropagation();
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          role="button"
          tabIndex={0}
        >
          {children}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="bg-[#18243a] border-[#304867] text-white min-w-[220px]"
      >
        <div className="flex items-center gap-2 rounded-md bg-[#111a2b] px-2 py-2">
          <Avatar size="sm">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
          <p className="truncate text-sm font-semibold text-white">{username}</p>
        </div>
        <ActionMenuContent mode="dropdown" scope="profile" actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
