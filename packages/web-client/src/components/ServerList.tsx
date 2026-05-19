import React, { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import { Button } from "@shared/app/ui/button";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import {
  Bell,
  LogIn,
  MessageCircle,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@shared/app/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@shared/app/ui/context-menu";
import { ActionMenuContent } from "@web-client/components/menus/ActionMenuContent";
import { resolveContextMenuIntent } from "@shared/infrastructure/contextMenu";
import { traceContextMenuEvent } from "@shared/infrastructure/contextMenu/debugTrace";
import { useHavenCore } from "@shared/core";
import type { ServerSummary } from "@shared/lib/backend/types";
import type { MenuActionNode } from "@shared/infrastructure/contextMenu/types";

interface ServerListProps {
  servers: ServerSummary[];
  currentServerIsOwner: boolean;
  canManageCurrentServer: boolean;
  canOpenCurrentServerSettings: boolean;
  onServerClick: (serverId: string) => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
  onOpenNotifications?: () => void;
  notificationUnseenCount?: number;
  notificationHasUnseenPulse?: boolean;
  onOpenDirectMessages?: () => void;
  directMessagesActive?: boolean;
  directMessageUnreadCount?: number;
  onOpenFriends?: () => void;
  friendRequestIncomingCount?: number;
  friendRequestHasPendingPulse?: boolean;
  onOpenServerModmail?: () => void;
  userDisplayName: string;
  userAvatarUrl: string | null;
  onOpenAccountSettings: () => void;
  onViewServerMembers?: (serverId: string) => void;
  onLeaveServer?: (serverId: string) => void;
  onDeleteServer?: (serverId: string) => void;
  onRenameServer?: (serverId: string) => void;
  onOpenServerSettingsForServer?: (serverId: string) => void;
  /** Called with the new ordered server IDs after user drag-reorders them. */
  onReorder?: (orderedIds: string[]) => void;
}

export function ServerList({
  servers,
  currentServerIsOwner,
  canManageCurrentServer,
  canOpenCurrentServerSettings,
  onServerClick,
  onCreateServer,
  onJoinServer,
  onOpenNotifications,
  notificationUnseenCount = 0,
  notificationHasUnseenPulse = false,
  onOpenDirectMessages,
  directMessagesActive = false,
  directMessageUnreadCount = 0,
  onOpenFriends,
  friendRequestIncomingCount = 0,
  friendRequestHasPendingPulse = false,
  onOpenServerModmail,
  userDisplayName,
  userAvatarUrl,
  onOpenAccountSettings,
  onViewServerMembers,
  onLeaveServer,
  onDeleteServer,
  onRenameServer,
  onOpenServerSettingsForServer,
  onReorder,
}: ServerListProps) {
  const currentServerId = useHavenCore().communities.useActiveId();
  const avatarInitial = userDisplayName.trim().charAt(0).toUpperCase() || "U";

  // Drag-to-reorder state
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const squareButtonBaseClass =
    "size-12 p-0 rounded-2xl flex items-center justify-center overflow-hidden transition-colors";

  return (
    <div className="w-[72px] bg-surface-panel overflow-hidden">
      <div className="flex h-full w-full flex-col px-3 py-3">
        <ScrollArea className="min-h-0 flex-1 [--scrollbar-size:8px] [&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&:hover_[data-slot=scroll-area-scrollbar]]:opacity-100 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity">
          <div className="flex w-full flex-col items-center gap-2">
            {servers.map((server, serverIdx) => {
              const isCurrentServer = currentServerId === server.id;
              const canRename =
                isCurrentServer &&
                canManageCurrentServer &&
                Boolean(onRenameServer);
              const canDelete =
                isCurrentServer &&
                currentServerIsOwner &&
                Boolean(onDeleteServer);
              const canOpenSettings =
                isCurrentServer &&
                canOpenCurrentServerSettings &&
                Boolean(onOpenServerSettingsForServer);
              const canLeave =
                Boolean(onLeaveServer) &&
                !(isCurrentServer && currentServerIsOwner);
              const isDragging = dragFromIdx === serverIdx;
              const isDragTarget =
                dragOverIdx === serverIdx && dragFromIdx !== serverIdx;
              const serverActions: MenuActionNode[] = [
                {
                  kind: "item",
                  key: `view-members-${server.id}`,
                  label: "View Members",
                  disabled: !onViewServerMembers,
                  onSelect: () => onViewServerMembers?.(server.id),
                },
                {
                  kind: "item",
                  key: `leave-server-${server.id}`,
                  label: "Leave Server",
                  disabled: !canLeave,
                  onSelect: () => onLeaveServer?.(server.id),
                },
                {
                  kind: "separator",
                  key: `server-separator-${server.id}`,
                },
                {
                  kind: "item",
                  key: `delete-server-${server.id}`,
                  label: "Delete Server",
                  destructive: true,
                  disabled: !canDelete,
                  onSelect: () => onDeleteServer?.(server.id),
                },
                {
                  kind: "item",
                  key: `rename-server-${server.id}`,
                  label: "Rename Server",
                  disabled: !canRename,
                  onSelect: () => onRenameServer?.(server.id),
                },
                {
                  kind: "item",
                  key: `open-server-settings-${server.id}`,
                  label: "Open Server Settings",
                  disabled: !canOpenSettings,
                  onSelect: () => onOpenServerSettingsForServer?.(server.id),
                },
              ];

              return (
                <div
                  key={server.id}
                  draggable={Boolean(onReorder)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragFromIdx(serverIdx);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverIdx !== serverIdx) setDragOverIdx(serverIdx);
                  }}
                  onDrop={() => {
                    if (
                      dragFromIdx !== null &&
                      dragFromIdx !== serverIdx &&
                      onReorder
                    ) {
                      const ids = servers.map((s) => s.id);
                      const [moved] = ids.splice(dragFromIdx, 1);
                      ids.splice(serverIdx, 0, moved);
                      onReorder(ids);
                    }
                    setDragFromIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragFromIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`transition-opacity ${isDragging ? "opacity-40" : ""} ${isDragTarget ? "ring-2 ring-primary rounded-2xl" : ""}`}
                >
                  <ContextMenu
                    onOpenChange={(nextOpen) => {
                      traceContextMenuEvent("server", "open-change", {
                        serverId: server.id,
                        open: nextOpen,
                      });
                    }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ContextMenuTrigger
                          asChild
                          onContextMenuCapture={(event) => {
                            const intent = resolveContextMenuIntent(
                              event.target,
                            );
                            traceContextMenuEvent(
                              "server",
                              "contextmenu-trigger",
                              {
                                serverId: server.id,
                                intent,
                              },
                            );
                            if (intent === "native_text") {
                              event.stopPropagation();
                            }
                          }}
                        >
                          <Button
                            data-menu-scope="server"
                            type="button"
                            onClick={() => onServerClick(server.id)}
                            className={`${squareButtonBaseClass} font-semibold text-white leading-none ${
                              isCurrentServer
                                ? "bg-primary hover:bg-primary"
                                : "bg-surface-legal hover:bg-primary"
                            }`}
                          >
                            <span className="text-base leading-none">
                              {server.name.charAt(0).toUpperCase()}
                            </span>
                          </Button>
                        </ContextMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {server.name}
                      </TooltipContent>
                    </Tooltip>
                    <ContextMenuContent className="bg-surface-legal border-border text-white">
                      <ActionMenuContent
                        mode="context"
                        scope="server"
                        actions={serverActions}
                      />
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="mt-2 flex w-full flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onCreateServer}
                className={`${squareButtonBaseClass} bg-surface-legal hover:bg-accent-success text-accent-success hover:text-white`}
              >
                <Plus className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Create server
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onJoinServer}
                className={`${squareButtonBaseClass} bg-surface-legal hover:bg-primary text-muted-foreground hover:text-white`}
              >
                <LogIn className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Join server
            </TooltipContent>
          </Tooltip>

          {onOpenNotifications && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={onOpenNotifications}
                  className={`${squareButtonBaseClass} relative overflow-visible bg-surface-legal hover:bg-primary text-muted-foreground hover:text-white`}
                >
                  <Bell className="size-5" />
                  {notificationUnseenCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-badge-unread text-white text-[10px] leading-[18px] font-semibold">
                      {notificationUnseenCount > 99
                        ? "99+"
                        : notificationUnseenCount}
                    </span>
                  )}
                  {notificationHasUnseenPulse && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-2xl border border-border-invite-pulse animate-pulse"
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Notifications
              </TooltipContent>
            </Tooltip>
          )}

          {onOpenFriends && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={onOpenFriends}
                  className={`${squareButtonBaseClass} relative overflow-visible bg-surface-legal hover:bg-primary text-muted-foreground hover:text-white`}
                >
                  <Users className="size-5" />
                  {friendRequestIncomingCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-badge-unread text-white text-[10px] leading-[18px] font-semibold">
                      {friendRequestIncomingCount > 99
                        ? "99+"
                        : friendRequestIncomingCount}
                    </span>
                  )}
                  {friendRequestHasPendingPulse && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-2xl border border-border-invite-pulse animate-pulse"
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Friends
              </TooltipContent>
            </Tooltip>
          )}

          {onOpenDirectMessages && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={onOpenDirectMessages}
                  className={`${squareButtonBaseClass} relative overflow-visible ${
                    directMessagesActive
                      ? "bg-primary hover:bg-primary text-white"
                      : "bg-surface-legal hover:bg-primary text-muted-foreground hover:text-white"
                  }`}
                >
                  <MessageCircle className="size-5" />
                  {directMessageUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-badge-unread text-white text-[10px] leading-[18px] font-semibold">
                      {directMessageUnreadCount > 99
                        ? "99+"
                        : directMessageUnreadCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Direct messages
              </TooltipContent>
            </Tooltip>
          )}

          {onOpenServerModmail && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={onOpenServerModmail}
                  className={`${squareButtonBaseClass} bg-surface-legal hover:bg-hub-hover-warm text-hub-warm hover:text-white`}
                >
                  <ShieldAlert className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Server Modmail
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onOpenAccountSettings}
                className={`${squareButtonBaseClass} bg-surface-legal hover:bg-border`}
              >
                <Avatar
                  className="w-full h-full rounded-2xl border border-border bg-surface-legal"
                  size="lg"
                >
                  {userAvatarUrl && (
                    <AvatarImage src={userAvatarUrl} alt="Account" />
                  )}
                  <AvatarFallback className="rounded-2xl bg-surface-legal text-white font-semibold">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Account settings
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
