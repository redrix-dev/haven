// Changed: add alternating message bubble skeleton to improve perceived loading for channel/DM conversation lists.
import React from 'react';

export interface MessageListSkeletonProps {
  rows?: number;
}

export function MessageListSkeleton({ rows = 7 }: MessageListSkeletonProps) {
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-3 animate-[shimmer_1.4s_ease-in-out_infinite]">
      {Array.from({ length: rows }).map((_, index) => {
        const own = index % 2 === 0;
        return (
          <div key={index} className={`flex gap-2.5 ${own ? 'flex-row-reverse' : 'flex-row'}`}>
            {!own && <div className="w-8 h-8 rounded-full bg-white/10 shrink-0 mt-0.5" />}
            <div className={`rounded-2xl h-14 bg-white/10 ${own ? 'w-[55%]' : 'w-[72%]'}`} />
          </div>
        );
      })}
      <div className="h-2 shrink-0" />
    </div>
  );
}
