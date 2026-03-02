// Changed: extract shared date separator UI used by channel and DM conversation lists.
import React from 'react';

export interface DateSeparatorProps {
  label: string;
}

export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-gray-500 text-[11px] font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}
