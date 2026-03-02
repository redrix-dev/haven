// Changed: extract shared mobile backdrop to unify dismiss behavior across sheets/drawers.
import React from 'react';

export interface BackdropProps {
  zIndex?: string;
  onDismiss: () => void;
  className?: string;
}

export function Backdrop({ zIndex = 'z-40', onDismiss, className = '' }: BackdropProps) {
  return (
    <div
      className={`fixed inset-0 bg-black/60 touch-none overscroll-none ${zIndex} ${className}`}
      onClick={onDismiss}
    />
  );
}
