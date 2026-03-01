import React from 'react';
import { Hash, Volume2, ChevronDown } from 'lucide-react';
import type { Channel } from '@/lib/backend/types';

interface MobileChannelSubHeaderProps {
  channel: Channel;
  drawerOpen: boolean;
  onToggle: () => void;
}

export function MobileChannelSubHeader({ channel, drawerOpen, onToggle }: MobileChannelSubHeaderProps) {
  const Icon = channel.kind === 'voice' ? Volume2 : Hash;

  return (
    <div className="flex items-center h-9 px-3 bg-[#0d1525]/80 border-b border-white/5 shrink-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 active:text-white transition-colors"
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-gray-500" />
        <span className="text-sm font-medium text-gray-200 truncate max-w-[220px]">{channel.name}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${drawerOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}
