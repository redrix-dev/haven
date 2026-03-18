import React from 'react';
import { Hash, Volume2, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import type { Channel } from '@shared/lib/backend/types';
import {
  MobileAnchoredPanel,
  MobileScrollableBody,
} from '@mobile/mobile/layout/MobileSurfacePrimitives';

interface ChannelGroup {
  id: string;
  name: string;
  channelIds: string[];
  isCollapsed: boolean;
}

interface MobileChannelDrawerProps {
  open: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  channelGroups?: ChannelGroup[];
  ungroupedChannelIds?: string[];
  canOpenChannelSettings?: boolean;
  onOpenChannelSettings?: (channelId: string) => void;
  onToggleGroup?: (groupId: string, isCollapsed: boolean) => void;
}

export function MobileChannelDrawer({
  open,
  onClose,
  channels,
  currentChannelId,
  onSelectChannel,
  channelGroups = [],
  ungroupedChannelIds = [],
  canOpenChannelSettings = false,
  onOpenChannelSettings,
  onToggleGroup,
}: MobileChannelDrawerProps) {
  if (!open) return null;

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const groupedIds = new Set(channelGroups.flatMap((group) => group.channelIds));

  const ungrouped = ungroupedChannelIds
    .map((id) => channelById.get(id))
    .filter((channel): channel is Channel => channel != null && !groupedIds.has(channel.id));

  const allOrdered = [
    ...ungrouped,
    ...channels.filter(
      (channel) => !groupedIds.has(channel.id) && !ungroupedChannelIds.includes(channel.id)
    ),
  ];

  const renderChannel = (channel: Channel) => {
    const Icon = channel.kind === 'voice' ? Volume2 : Hash;
    const isActive = channel.id === currentChannelId;

    return (
      <div
        key={channel.id}
        className={`flex items-center border-b border-white/5 last:border-b-0 ${
          isActive ? 'bg-blue-600/10' : ''
        }`}
      >
        <button
          onClick={() => {
            onSelectChannel(channel.id);
            onClose();
          }}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
        >
          <Icon
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-blue-400' : 'text-gray-500'
            }`}
          />
          <span
            className={`flex-1 text-sm ${
              isActive ? 'text-white font-semibold' : 'text-gray-300'
            }`}
          >
            {channel.name}
          </span>
          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
        </button>

        {canOpenChannelSettings && onOpenChannelSettings && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenChannelSettings(channel.id);
              onClose();
            }}
            aria-label={`Settings for ${channel.name}`}
            className="shrink-0 w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <MobileAnchoredPanel
      open={open}
      onClose={onClose}
      anchor="below-all-headers"
      label="Channel Drawer"
      id="mobile-channel-drawer"
      className="rounded-b-2xl border border-white/10 border-t-0"
    >
      <div className="flex max-h-full flex-col bg-[#0d1525] shadow-2xl">
        <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
            Channels
          </p>
        </div>

        {channels.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">No channels</p>
        )}

        <MobileScrollableBody className="max-h-[60vh]">
          {channelGroups.length > 0 &&
            channelGroups.map((group) => {
              const groupChannels = group.channelIds
                .map((id) => channelById.get(id))
                .filter((channel): channel is Channel => Boolean(channel));

              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => onToggleGroup?.(group.id, !group.isCollapsed)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/5"
                  >
                    {group.isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    )}
                    <span className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">
                      {group.name}
                    </span>
                  </button>

                  {!group.isCollapsed && groupChannels.map(renderChannel)}
                </div>
              );
            })}

          {allOrdered.map(renderChannel)}
        </MobileScrollableBody>
      </div>
    </MobileAnchoredPanel>
  );
}
