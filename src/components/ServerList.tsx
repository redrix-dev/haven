import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogIn, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ActionMenuContent } from '@/components/menus/ActionMenuContent';
import { resolveContextMenuIntent } from '@/lib/contextMenu';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';
import type { MenuActionNode } from '@/lib/contextMenu/types';

interface Server {
  id: string;
  name: string;
  icon?: string;
}

interface ServerListProps {
  servers: Server[];
  currentServerId: string | null;
  currentServerIsOwner: boolean;
  canManageCurrentServer: boolean;
  canOpenCurrentServerSettings: boolean;
  onServerClick: (serverId: string) => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
  userDisplayName: string;
  userAvatarUrl: string | null;
  onOpenAccountSettings: () => void;
  onViewServerMembers?: (serverId: string) => void;
  onLeaveServer?: (serverId: string) => void;
  onDeleteServer?: (serverId: string) => void;
  onRenameServer?: (serverId: string) => void;
  onOpenServerSettingsForServer?: (serverId: string) => void;
}

export function ServerList({
  servers,
  currentServerId,
  currentServerIsOwner,
  canManageCurrentServer,
  canOpenCurrentServerSettings,
  onServerClick,
  onCreateServer,
  onJoinServer,
  userDisplayName,
  userAvatarUrl,
  onOpenAccountSettings,
  onViewServerMembers,
  onLeaveServer,
  onDeleteServer,
  onRenameServer,
  onOpenServerSettingsForServer,
}: ServerListProps) {
  const avatarInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'U';
  const squareButtonBaseClass =
    'size-12 p-0 rounded-2xl flex items-center justify-center overflow-hidden transition-colors';

  return (
    <div className="w-[72px] bg-[#142033] overflow-hidden">
      <div className="flex h-full w-full flex-col px-3 py-3">
        <ScrollArea className="min-h-0 flex-1 [--scrollbar-size:8px] [&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&:hover_[data-slot=scroll-area-scrollbar]]:opacity-100 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity">
          <div className="flex w-full flex-col items-center gap-2">
            {servers.map((server) => {
              const isCurrentServer = currentServerId === server.id;
              const canRename = isCurrentServer && canManageCurrentServer && Boolean(onRenameServer);
              const canDelete = isCurrentServer && currentServerIsOwner && Boolean(onDeleteServer);
              const canOpenSettings =
                isCurrentServer &&
                canOpenCurrentServerSettings &&
                Boolean(onOpenServerSettingsForServer);
              const canLeave = Boolean(onLeaveServer) && !(isCurrentServer && currentServerIsOwner);
              const serverActions: MenuActionNode[] = [
                {
                  kind: 'item',
                  key: `view-members-${server.id}`,
                  label: 'View Members',
                  disabled: !onViewServerMembers,
                  onSelect: () => onViewServerMembers?.(server.id),
                },
                {
                  kind: 'item',
                  key: `leave-server-${server.id}`,
                  label: 'Leave Server',
                  disabled: !canLeave,
                  onSelect: () => onLeaveServer?.(server.id),
                },
                {
                  kind: 'separator',
                  key: `server-separator-${server.id}`,
                },
                {
                  kind: 'item',
                  key: `delete-server-${server.id}`,
                  label: 'Delete Server',
                  destructive: true,
                  disabled: !canDelete,
                  onSelect: () => onDeleteServer?.(server.id),
                },
                {
                  kind: 'item',
                  key: `rename-server-${server.id}`,
                  label: 'Rename Server',
                  disabled: !canRename,
                  onSelect: () => onRenameServer?.(server.id),
                },
                {
                  kind: 'item',
                  key: `open-server-settings-${server.id}`,
                  label: 'Open Server Settings',
                  disabled: !canOpenSettings,
                  onSelect: () => onOpenServerSettingsForServer?.(server.id),
                },
              ];

              return (
                <ContextMenu
                  key={server.id}
                  onOpenChange={(nextOpen) => {
                    traceContextMenuEvent('server', 'open-change', {
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
                          const intent = resolveContextMenuIntent(event.target);
                          traceContextMenuEvent('server', 'contextmenu-trigger', {
                            serverId: server.id,
                            intent,
                          });
                          if (intent === 'native_text') {
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
                              ? 'bg-[#3f79d8] hover:bg-[#3f79d8]'
                              : 'bg-[#18243a] hover:bg-[#3f79d8]'
                          }`}
                        >
                          <span className="text-base leading-none">
                            {server.icon || server.name.charAt(0).toUpperCase()}
                          </span>
                        </Button>
                      </ContextMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {server.name}
                    </TooltipContent>
                  </Tooltip>
                  <ContextMenuContent className="bg-[#18243a] border-[#304867] text-white">
                    <ActionMenuContent mode="context" scope="server" actions={serverActions} />
                  </ContextMenuContent>
                </ContextMenu>
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
                className={`${squareButtonBaseClass} bg-[#18243a] hover:bg-[#2f9f73] text-[#2f9f73] hover:text-white`}
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
                className={`${squareButtonBaseClass} bg-[#18243a] hover:bg-[#3f79d8] text-[#a9b8cf] hover:text-white`}
              >
                <LogIn className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Join server
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onOpenAccountSettings}
                className={`${squareButtonBaseClass} bg-[#18243a] hover:bg-[#304867]`}
              >
                <Avatar className="w-full h-full rounded-2xl border border-[#304867] bg-[#18243a]" size="lg">
                  {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt="Account" />}
                  <AvatarFallback className="rounded-2xl bg-[#18243a] text-white font-semibold">
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
