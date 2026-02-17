import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogIn, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Server {
  id: string;
  name: string;
  icon?: string;
}

interface ServerListProps {
  servers: Server[];
  currentServerId: string | null;
  onServerClick: (serverId: string) => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
  userDisplayName: string;
  userAvatarUrl: string | null;
  onOpenAccountSettings: () => void;
}

export function ServerList({ 
  servers, 
  currentServerId, 
  onServerClick,
  onCreateServer,
  onJoinServer,
  userDisplayName,
  userAvatarUrl,
  onOpenAccountSettings,
}: ServerListProps) {
  const avatarInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'U';
  const squareButtonBaseClass =
    'size-12 p-0 rounded-2xl flex items-center justify-center overflow-hidden transition-colors';

  return (
    <div className="w-[72px] bg-[#142033] overflow-hidden">
      <div className="flex h-full w-full flex-col px-3 py-3">
        {/* Servers */}
        <ScrollArea className="min-h-0 flex-1 [--scrollbar-size:8px] [&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&:hover_[data-slot=scroll-area-scrollbar]]:opacity-100 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity">
          <div className="flex w-full flex-col items-center gap-2">
            {servers.map((server) => (
              <Tooltip key={server.id}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={() => onServerClick(server.id)}
                    className={`${squareButtonBaseClass} font-semibold text-white leading-none ${
                      currentServerId === server.id
                        ? 'bg-[#3f79d8] hover:bg-[#3f79d8]'
                        : 'bg-[#18243a] hover:bg-[#3f79d8]'
                    }`}
                  >
                    <span className="text-base leading-none">
                      {server.icon || server.name.charAt(0).toUpperCase()}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {server.name}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </ScrollArea>

        <div className="mt-2 flex w-full flex-col items-center gap-2">
          {/* Add Server Button */}
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

          {/* Join Server Button */}
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

          {/* Account Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onOpenAccountSettings}
                className={`${squareButtonBaseClass} bg-[#18243a] hover:bg-[#304867]`}
              >
                <Avatar
                  className="w-full h-full rounded-2xl border border-[#304867] bg-[#18243a]"
                  size="lg"
                >
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

