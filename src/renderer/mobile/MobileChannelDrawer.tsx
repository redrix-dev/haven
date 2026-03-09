import React from 'react';
import { Hash, Volume2, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import type { Channel } from '@/lib/backend/types';

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
  /** Channel groups — when provided, channels render in grouped sections */
  channelGroups?: ChannelGroup[];
  ungroupedChannelIds?: string[];
  /** When provided, settings icon appears per channel (gated externally by permission) */
  canOpenChannelSettings?: boolean;
  onOpenChannelSettings?: (channelId: string) => void;
  /** When provided, toggle collapse per group */
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

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const groupedIds = new Set(channelGroups.flatMap((g) => g.channelIds));

  // Ungrouped channels in order
  const ungrouped = ungroupedChannelIds
    .map((id) => channelById.get(id))
    .filter((c): c is Channel => c != null && !groupedIds.has(c.id));

  // Also include any channels not in ungroupedChannelIds and not in any group
  const allOrdered = [
    ...ungrouped,
    ...channels.filter((c) => !groupedIds.has(c.id) && !ungroupedChannelIds.includes(c.id)),
  ];

  const renderChannel = (channel: Channel) => {
    const Icon = channel.kind === 'voice' ? Volume2 : Hash;
    const isActive = channel.id === currentChannelId;

    return (
      <div
        key={channel.id}
        className={`flex items-center border-b border-white/5 last:border-b-0 ${isActive ? 'bg-blue-600/10' : ''}`}
      >
        <button
          onClick={() => { onSelectChannel(channel.id); onClose(); }}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
        >
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
          <span className={`flex-1 text-sm ${isActive ? 'text-white font-semibold' : 'text-gray-300'}`}>
            {channel.name}
          </span>
          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
        </button>

        {/* Channel settings icon — shown when user has permissions */}
        {canOpenChannelSettings && onOpenChannelSettings && (
          <button
            onClick={(e) => {
              e.stopPropagation();
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

  const hasGroups = channelGroups.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 touch-none overscroll-none" onClick={onClose} />

      {/* Panel */}
      <div className="absolute top-full left-0 right-0 z-40 bg-[#0d1525] border border-white/10 border-t-0 rounded-b-2xl max-h-[60vh] overflow-y-auto overscroll-contain shadow-2xl">
        <div className="px-4 py-2.5 border-b border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Channels</p>
        </div>

        {channels.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">No channels</p>
        )}

        {/* Grouped sections */}
        {hasGroups && channelGroups.map((group) => {
          const groupChannels = group.channelIds
            .map((id) => channelById.get(id))
            .filter((c): c is Channel => Boolean(c));

          return (
            <div key={group.id}>
              {/* Group header — tappable to collapse */}
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

              {/* Group channels */}
              {!group.isCollapsed && groupChannels.map(renderChannel)}
            </div>
          );
        })}

        {/* Ungrouped channels */}
        {allOrdered.map(renderChannel)}
      </div>
    </>
  );
}
