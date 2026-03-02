// Changed: add a reusable avatar bubble component with consistent fallback initials and sizing.
import React from 'react';

export interface AvatarBubbleProps {
  url?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClassMap: Record<NonNullable<AvatarBubbleProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
};

export function AvatarBubble({ url, name, size = 'sm', className = '' }: AvatarBubbleProps) {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden ${sizeClassMap[size]} ${className}`}
    >
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : initial}
    </div>
  );
}
