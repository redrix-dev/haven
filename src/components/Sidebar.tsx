import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Hash, Headphones, Plus, Settings } from 'lucide-react';
import { Database } from '@/types/database';

type ChannelKind = Database['public']['Enums']['channel_kind'];

interface SidebarProps {
  serverName: string;
  userName: string;
  channels: Array<{ id: string; name: string; kind: ChannelKind }>;
  currentChannelId: string | null;
  onChannelClick: (channelId: string) => void;
  onVoiceChannelClick?: (channelId: string) => void;
  activeVoiceChannelId?: string | null;
  voiceChannelParticipants?: Record<string, Array<{ userId: string; displayName: string }>>;
  voiceStatusPanel?: React.ReactNode;
  onCreateChannel?: () => void;
  onOpenServerSettings?: () => void;
}

export function Sidebar({
  serverName,
  userName,
  channels,
  currentChannelId,
  onChannelClick,
  onVoiceChannelClick,
  activeVoiceChannelId = null,
  voiceChannelParticipants = {},
  voiceStatusPanel,
  onCreateChannel,
  onOpenServerSettings,
}: SidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === 'text');
  const voiceChannels = channels.filter((channel) => channel.kind === 'voice');

  return (
    <div className="w-60 bg-[#1c2a43] flex flex-col">
      <div className="h-12 px-3 flex items-center justify-between font-semibold text-white border-b border-[#263a58]">
        <span className="truncate">{serverName}</span>
        <div className="flex items-center gap-1">
          {onCreateChannel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onCreateChannel}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#304867]"
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Create channel
              </TooltipContent>
            </Tooltip>
          )}
          {onOpenServerSettings && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenServerSettings}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#304867]"
                >
                  <Settings className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Server settings
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {textChannels.length > 0 && (
            <div className="mb-3">
              <p className="px-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-[#7f90ac]">
                Text Channels
              </p>
              {textChannels.map((channel) => (
                <Button
                  key={channel.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onChannelClick(channel.id)}
                  className={`w-full px-2 py-1.5 rounded text-left text-sm transition-colors justify-start ${
                    currentChannelId === channel.id
                      ? 'bg-[#3f79d8] text-white'
                      : 'text-[#95a5bf] hover:bg-[#22334f] hover:text-[#e6edf7]'
                  }`}
                >
                  <Hash className="size-4" />
                  <span>{channel.name}</span>
                </Button>
              ))}
            </div>
          )}

          {voiceChannels.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-[#7f90ac]">
                Voice Channels
              </p>
              {voiceChannels.map((channel) => (
                <div key={channel.id} className="mb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      onVoiceChannelClick ? onVoiceChannelClick(channel.id) : onChannelClick(channel.id)
                    }
                    className={`w-full px-2 py-1.5 rounded text-left text-sm transition-colors justify-start ${
                      activeVoiceChannelId === channel.id || currentChannelId === channel.id
                        ? 'bg-[#3f79d8] text-white'
                        : 'text-[#95a5bf] hover:bg-[#22334f] hover:text-[#e6edf7]'
                    }`}
                  >
                    <Headphones className="size-4" />
                    <span>{channel.name}</span>
                  </Button>

                  {voiceChannelParticipants[channel.id] && voiceChannelParticipants[channel.id].length > 0 && (
                    <div className="px-2 pt-1 flex items-center gap-1">
                      {voiceChannelParticipants[channel.id].slice(0, 4).map((participant) => {
                        const initial = participant.displayName.trim().charAt(0).toUpperCase() || '?';
                        return (
                          <Tooltip key={participant.userId}>
                            <TooltipTrigger asChild>
                              <span className="size-5 rounded-full bg-[#304867] text-[10px] text-white font-semibold flex items-center justify-center">
                                {initial}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={6}>
                              {participant.displayName}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {voiceChannelParticipants[channel.id].length > 4 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="size-5 rounded-full bg-[#22334f] text-[10px] text-[#d1dff4] font-semibold flex items-center justify-center">
                              ...
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={6}>
                            {voiceChannelParticipants[channel.id]
                              .map((participant) => participant.displayName)
                              .join(', ')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="bg-[#172338]" data-component="sidebar">
        {voiceStatusPanel}
        <div className="h-14 px-2 flex items-center text-xs">
          <div className="flex-1">
            <div className="font-semibold text-white">{userName}</div>
            <div className="text-[#44b894]">Online</div>
          </div>
        </div>
      </div>
    </div>
  );
}

