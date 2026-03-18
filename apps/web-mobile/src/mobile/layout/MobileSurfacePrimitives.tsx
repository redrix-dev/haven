import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import {
  MobileSurfaceDescriptor,
  MobileSurfacePortal,
  MobileSurfaceKind,
} from '@web-mobile/mobile/layout/MobileSurfaceHost';

function useSurfaceDescriptor(
  kind: MobileSurfaceKind,
  label?: string,
  id?: string
): MobileSurfaceDescriptor {
  const reactId = React.useId();

  return React.useMemo(
    () => ({
      id: id ?? `${kind}:${label ?? 'surface'}:${reactId}`,
      kind,
      label,
    }),
    [id, kind, label, reactId]
  );
}

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
  id?: string;
  label?: string;
  size?: 'auto' | 'full';
}

export function MobileSheet({
  open,
  onClose,
  children,
  className,
  closeOnBackdrop = true,
  id,
  label,
  size = 'full',
}: MobileSheetProps) {
  const descriptor = useSurfaceDescriptor('sheet', label, id);
  const surfaceStyle = React.useMemo<React.CSSProperties>(
    () => ({
      maxHeight: 'calc(var(--mobile-shell-height) - var(--mobile-safe-top))',
      ...(size === 'full'
        ? {
            height: 'calc(var(--mobile-shell-height) - var(--mobile-safe-top) - 0.75rem)',
          }
        : {}),
    }),
    [size]
  );

  if (!open) return null;

  return (
    <MobileSurfacePortal descriptor={descriptor}>
      <div className="absolute inset-0 pointer-events-none" data-mobile-surface-root={descriptor.id}>
        <button
          type="button"
          aria-label={label ? `Dismiss ${label}` : 'Dismiss surface'}
          className="pointer-events-auto absolute inset-0 bg-black/60"
          onClick={closeOnBackdrop ? onClose : undefined}
        />
        <div
          data-mobile-surface={descriptor.id}
          className={cn(
            'pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0d1525] shadow-2xl',
            className
          )}
          style={surfaceStyle}
        >
          {children}
        </div>
      </div>
    </MobileSurfacePortal>
  );
}

export function MobileSheetHandle({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center pt-3 pb-1 shrink-0', className)}>
      <div className="w-9 h-1 rounded-full bg-white/20" />
    </div>
  );
}

export function MobileSheetHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0', className)}>
      {children}
    </div>
  );
}

export function MobileSheetTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={cn('flex-1 text-base font-semibold text-white', className)}>{children}</h2>;
}

export function MobileSheetCloseButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors shrink-0',
        className
      )}
      aria-label="Close"
    >
      <X className="w-4 h-4 text-gray-400" />
    </button>
  );
}

export function MobileScrollableBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
}

export function MobileSheetFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('shrink-0 border-t border-white/10 px-4 pt-3', className)}
      style={{ paddingBottom: 'calc(var(--mobile-safe-bottom) + 0.75rem)' }}
    >
      {children}
    </div>
  );
}

interface MobileAnchoredPanelProps {
  anchor: 'below-all-headers' | 'below-primary-header';
  children: React.ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
  id?: string;
  label?: string;
  onClose: () => void;
  open: boolean;
}

export function MobileAnchoredPanel({
  anchor,
  children,
  className,
  closeOnBackdrop = true,
  id,
  label,
  onClose,
  open,
}: MobileAnchoredPanelProps) {
  const descriptor = useSurfaceDescriptor('anchored-panel', label, id);

  if (!open) return null;

  const placementStyle: React.CSSProperties =
    anchor === 'below-all-headers'
      ? {
          top: 'calc(var(--mobile-safe-top) + var(--mobile-header-height) + var(--mobile-subheader-height))',
          maxHeight:
            'calc(var(--mobile-shell-height) - var(--mobile-safe-top) - var(--mobile-header-height) - var(--mobile-subheader-height) - var(--mobile-safe-bottom))',
        }
      : {
          top: 'calc(var(--mobile-safe-top) + var(--mobile-header-height))',
          maxHeight:
            'calc(var(--mobile-shell-height) - var(--mobile-safe-top) - var(--mobile-header-height) - var(--mobile-safe-bottom))',
        };

  return (
    <MobileSurfacePortal descriptor={descriptor}>
      <div className="absolute inset-0 pointer-events-none" data-mobile-surface-root={descriptor.id}>
        <button
          type="button"
          aria-label={label ? `Dismiss ${label}` : 'Dismiss panel'}
          className="pointer-events-auto absolute inset-0 bg-black/60"
          onClick={closeOnBackdrop ? onClose : undefined}
        />
        <div
          data-mobile-surface={descriptor.id}
          className={cn(
            'pointer-events-auto absolute inset-x-0 flex flex-col bg-[#0d1525] shadow-2xl',
            className
          )}
          style={placementStyle}
        >
          {children}
        </div>
      </div>
    </MobileSurfacePortal>
  );
}

interface MobilePopoverCardProps {
  children: React.ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
  id?: string;
  label?: string;
  onClose: () => void;
  open: boolean;
  placement?: 'docked' | 'floating';
}

export function MobilePopoverCard({
  children,
  className,
  closeOnBackdrop = true,
  id,
  label,
  onClose,
  open,
  placement = 'floating',
}: MobilePopoverCardProps) {
  const descriptor = useSurfaceDescriptor('popover-card', label, id);
  const surfaceStyle = React.useMemo<React.CSSProperties>(
    () => ({
      bottom:
        placement === 'docked'
          ? 'var(--mobile-safe-bottom)'
          : 'calc(var(--mobile-safe-bottom) + 1rem)',
    }),
    [placement]
  );

  if (!open) return null;

  return (
    <MobileSurfacePortal descriptor={descriptor}>
      <div className="absolute inset-0 pointer-events-none" data-mobile-surface-root={descriptor.id}>
        <button
          type="button"
          aria-label={label ? `Dismiss ${label}` : 'Dismiss popover'}
          className="pointer-events-auto absolute inset-0 bg-black/60"
          onClick={closeOnBackdrop ? onClose : undefined}
        />
        <div
          data-mobile-surface={descriptor.id}
          className={cn(
            'pointer-events-auto absolute inset-x-4 rounded-2xl border border-white/10 bg-[#111c30] shadow-xl',
            className
          )}
          style={surfaceStyle}
        >
          {children}
        </div>
      </div>
    </MobileSurfacePortal>
  );
}
