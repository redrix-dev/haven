import React from 'react';
import { ChevronDown } from 'lucide-react';

interface MobileServerSubHeaderProps {
  serverName: string;
  onPress: () => void;
}

export function MobileServerSubHeader({ serverName, onPress }: MobileServerSubHeaderProps) {
  return (
    <div className="flex items-center justify-center h-11 bg-[#0d1525]/95 border-b border-white/8 shrink-0">
      <button
        onClick={onPress}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors max-w-[280px]"
      >
        <span className="text-sm font-semibold text-white truncate">{serverName}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>
    </div>
  );
}
