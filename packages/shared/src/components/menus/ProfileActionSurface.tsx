import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { ActionMenuContent } from "@shared/components/menus/ActionMenuContent";
import type { BanEligibleServer } from "@shared/lib/backend/types";
import type { MenuActionNode } from "@shared/lib/contextMenu/types";
import { resolveContextMenuIntent } from "@shared/lib/contextMenu";
import { traceContextMenuEvent } from "@shared/lib/contextMenu/debugTrace";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";

export interface ProfileActionSurfaceProps {
  userId: string;
  username: string;
  avatarUrl: string | null;
  canDirectMessage?: boolean;
  canReport: boolean;
  canBan: boolean;
  canKick?: boolean;
  kickDisabledReason?: string | null;
  onDirectMessage: (userId: string) => void;
  onReport: (userId: string) => void;
  onBan: (userId: string, communityId: string) => void;
  onKick?: (userId: string) => void;
  resolveBanServers: (userId: string) => Promise<BanEligibleServer[]>;
  children: React.ReactNode;
}

export function ProfileActionSurface({
  userId,
  username,
  avatarUrl,
  canDirectMessage = true,
  canReport,
  canBan,
  canKick = false,
  kickDisabledReason = null,
  onDirectMessage,
  onReport,
  onBan,
  onKick,
  resolveBanServers,
  children,
}: ProfileActionSurfaceProps) {
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const [open, setOpen] = React.useState(false);
  const [banServers, setBanServers] = React.useState<BanEligibleServer[]>([]);
  const [banServersLoading, setBanServersLoading] = React.useState(false);
  const preserveFallbackIdentity =
    avatarUrl === null &&
    (username === "Banned User" || username === "Unknown User");

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

  const resolvedUsername = preserveFallbackIdentity
    ? username
    : resolveLiveUsername(liveProfiles, userId, username) ?? username;
  const resolvedAvatarUrl = preserveFallbackIdentity
    ? avatarUrl
    : resolveLiveAvatarUrl(liveProfiles, userId, avatarUrl);
  const avatarInitial = resolvedUsername.trim().charAt(0).toUpperCase() || "U";

  const actions = React.useMemo<MenuActionNode[]>(() => {
    const next: MenuActionNode[] = [
      {
        kind: "separator",
        key: "header-separator",
      },
      {
        kind: "item",
        key: "direct-message",
        label: "Direct Message",
        disabled: !canDirectMessage,
        onSelect: () => {
          setOpen(false);
          onDirectMessage(userId);
        },
      },
      {
        kind: "item",
        key: "report",
        label: "Report",
        disabled: !canReport,
        onSelect: () => {
          setOpen(false);
          onReport(userId);
        },
      },
    ];

    if (canBan) {
      const banItems: MenuActionNode[] = banServersLoading
        ? [
            {
              kind: "item",
              key: "ban-loading",
              label: "Loading servers...",
              disabled: true,
              onSelect: () => undefined,
            },
          ]
        : banServers.length === 0
          ? [
              {
                kind: "item",
                key: "ban-none",
                label: "No eligible servers",
                disabled: true,
                onSelect: () => undefined,
              },
            ]
          : banServers.map((server) => ({
              kind: "item",
              key: `ban-${server.communityId}`,
              label: server.communityName,
              onSelect: () => {
                setOpen(false);
                onBan(userId, server.communityId);
              },
            }));

      next.push({
        kind: "submenu",
        key: "ban",
        label: "Ban",
        items: banItems,
      });
    }

    if ((canKick || kickDisabledReason) && onKick) {
      next.push({
        kind: "item",
        key: "kick",
        label: kickDisabledReason
          ? `Kick from Server - ${kickDisabledReason}`
          : "Kick from Server",
        destructive: true,
        disabled: !canKick || Boolean(kickDisabledReason),
        onSelect: () => {
          setOpen(false);
          onKick(userId);
        },
      });
    }

    return next;
  }, [
    banServers,
    banServersLoading,
    canBan,
    canDirectMessage,
    canKick,
    canReport,
    kickDisabledReason,
    onBan,
    onDirectMessage,
    onKick,
    onReport,
    userId,
  ]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        traceContextMenuEvent("profile", "open-change", {
          userId,
          open: nextOpen,
        });
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
            traceContextMenuEvent("profile", "contextmenu-trigger", {
              intent,
              userId,
            });
            if (intent === "native_text") {
              event.stopPropagation();
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
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
        onCloseAutoFocus={(event) => {
          // Prevent focus from being restored to a trigger that may be unmounted
          // immediately after navigation-style actions (e.g. "Direct Message").
          event.preventDefault();
        }}
      >
        <div className="flex items-center gap-2 rounded-md bg-[#111a2b] px-2 py-2">
          <Avatar size="sm">
            {resolvedAvatarUrl && (
              <AvatarImage src={resolvedAvatarUrl} alt={resolvedUsername} />
            )}
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
          <p className="truncate text-sm font-semibold text-white">
            {resolvedUsername}
          </p>
        </div>
        <ActionMenuContent mode="dropdown" scope="profile" actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
