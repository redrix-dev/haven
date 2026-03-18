import React from 'react';
import { cn } from '@shared/lib/utils';

interface MobileSceneScaffoldProps {
  body: React.ReactNode;
  bodyClassName?: string;
  children?: React.ReactNode;
  className?: string;
  dock?: React.ReactNode;
  dockClassName?: string;
  dockRef?: React.Ref<HTMLDivElement | null>;
  header?: React.ReactNode;
  headerClassName?: string;
  scrollRef?: React.Ref<HTMLDivElement>;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T): void {
  if (!ref) return;

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  (ref as React.MutableRefObject<T>).current = value;
}

export function MobileSceneScaffold({
  body,
  bodyClassName,
  children,
  className,
  dock,
  dockClassName,
  dockRef,
  header,
  headerClassName,
  scrollRef,
}: MobileSceneScaffoldProps) {
  const rowCount = [header ? 'auto' : null, 'minmax(0, 1fr)', dock ? 'auto' : null]
    .filter(Boolean)
    .join(' ');
  const localDockRef = React.useRef<HTMLDivElement | null>(null);
  const [dockHeightPx, setDockHeightPx] = React.useState(0);

  React.useLayoutEffect(() => {
    const node = localDockRef.current;

    if (!node) {
      setDockHeightPx(0);
      return;
    }

    const updateDockHeight = () => {
      setDockHeightPx(node.getBoundingClientRect().height);
    };

    updateDockHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateDockHeight);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [dock]);

  const scaffoldStyle = React.useMemo(
    () =>
      ({
        '--mobile-scene-dock-height': `${dockHeightPx}px`,
      }) as React.CSSProperties,
    [dockHeightPx]
  );

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      data-mobile-scene="true"
      style={scaffoldStyle}
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateRows: rowCount }}
      >
        {header ? (
          <div
            className={cn('min-h-0 shrink-0', headerClassName)}
            data-mobile-scene-header="true"
          >
            {header}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            'min-h-0 overflow-y-auto overscroll-contain',
            bodyClassName
          )}
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollPaddingBottom: 'calc(var(--mobile-scene-dock-height, 0px) + 0.75rem)',
          }}
          data-mobile-scene-scroll="true"
        >
          {body}
        </div>

        {dock ? (
          <div
            ref={(node) => {
              localDockRef.current = node;
              assignRef(dockRef, node);
            }}
            className={cn(
              'min-h-0 shrink-0 border-t border-white/10 bg-[#0d1525]',
              dockClassName
            )}
            style={{ paddingBottom: 'calc(var(--mobile-safe-bottom) + 0.5rem)' }}
            data-mobile-scene-dock="true"
          >
            {dock}
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
