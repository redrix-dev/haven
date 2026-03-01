import React from 'react';
import { Hash, Volume2 } from 'lucide-react';
import type { Channel } from '@/lib/backend/types';

interface MobileChannelDrawerProps {
  open: boolean;
  onClose: () => void;
  channels: Channel[];
  currentChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

export function MobileChannelDrawer({
  open,
  onClose,
  channels,
  currentChannelId,
  onSelectChannel,
}: MobileChannelDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 touch-none overscroll-none" onClick={onClose} />

      {/* Panel drops from below the sub-header (top-full = below the relative parent) */}
      <div className="absolute top-full left-0 right-0 z-40 bg-[#0d1525] border border-white/10 border-t-0 rounded-b-2xl max-h-[60vh] overflow-y-auto overscroll-contain shadow-2xl">
        <div className="px-4 py-2.5 border-b border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Channels</p>
        </div>

        {channels.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">No channels</p>
        )}

        {channels.map((channel) => {
          const Icon = channel.kind === 'voice' ? Volume2 : Hash;
          const isActive = channel.id === currentChannelId;
          return (
            <button
              key={channel.id}
              onClick={() => { onSelectChannel(channel.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/5 last:border-b-0 ${
                isActive ? 'bg-blue-600/10' : ''
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
              <span className={`flex-1 text-sm text-left ${isActive ? 'text-white font-semibold' : 'text-gray-300'}`}>
                {channel.name}
              </span>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
