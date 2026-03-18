import React from 'react';
import { MobileLayoutDebugOverlay } from '@mobile/mobile/layout/MobileLayoutDebugOverlay';
import { MobileSurfaceHost } from '@mobile/mobile/layout/MobileSurfaceHost';
import { useMobileViewport } from '@mobile/mobile/layout/MobileViewportContext';

function useElementHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [heightPx, setHeightPx] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      setHeightPx(0);
      return;
    }

    const updateHeight = () => {
      setHeightPx(element.getBoundingClientRect().height);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return heightPx;
}

interface MobileAppShellProps {
  body: React.ReactNode;
  children?: React.ReactNode;
  primaryHeader?: React.ReactNode;
  secondaryHeader?: React.ReactNode;
}

export function MobileAppShell({
  body,
  children,
  primaryHeader,
  secondaryHeader,
}: MobileAppShellProps) {
  const viewport = useMobileViewport();
  const primaryHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const secondaryHeaderRef = React.useRef<HTMLDivElement | null>(null);

  const headerHeightPx = useElementHeight(primaryHeaderRef);
  const subheaderHeightPx = useElementHeight(secondaryHeaderRef);

  const shellStyle = React.useMemo(
    () =>
      ({
        height: 'var(--mobile-shell-height)',
        '--mobile-shell-height': `${viewport.shellHeightPx}px`,
        '--mobile-safe-top': 'env(safe-area-inset-top, 0px)',
        '--mobile-safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        '--mobile-header-height': `${headerHeightPx}px`,
        '--mobile-subheader-height': `${subheaderHeightPx}px`,
        '--mobile-bottom-dock-height': '0px',
      }) as React.CSSProperties,
    [
      headerHeightPx,
      subheaderHeightPx,
      viewport.shellHeightPx,
    ]
  );

  return (
    <MobileSurfaceHost
      data-mobile-shell="true"
      className="fixed top-0 left-0 right-0 flex min-h-0 flex-col overflow-hidden bg-[#111a2b] text-white"
      style={shellStyle}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          paddingTop: 'var(--mobile-safe-top)',
        }}
      >
        {primaryHeader && (
          <div
            ref={primaryHeaderRef}
            className="shrink-0"
            data-mobile-slot="primary-header"
          >
            {primaryHeader}
          </div>
        )}

        {secondaryHeader && (
          <div
            ref={secondaryHeaderRef}
            className="shrink-0"
            data-mobile-slot="secondary-header"
          >
            {secondaryHeader}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
      </div>

      <MobileLayoutDebugOverlay
        bottomDockHeightPx={0}
        headerHeightPx={headerHeightPx}
        subheaderHeightPx={subheaderHeightPx}
      />

      {children}
    </MobileSurfaceHost>
  );
}
