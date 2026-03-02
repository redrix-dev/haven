// Changed: add DM inbox skeleton rows to replace spinner-only loading for first render.
import React from 'react';

export interface DmInboxSkeletonProps {
  rows?: number;
}

export function DmInboxSkeleton({ rows = 5 }: DmInboxSkeletonProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/5 animate-[shimmer_1.4s_ease-in-out_infinite]">
          <div className="w-11 h-11 rounded-full bg-white/10 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 rounded bg-white/10 w-2/5" />
            <div className="h-2.5 rounded bg-white/10 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
