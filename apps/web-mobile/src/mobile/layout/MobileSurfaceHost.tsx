import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@shared/lib/utils';

export type MobileSurfaceKind =
  | 'anchored-panel'
  | 'debug'
  | 'popover-card'
  | 'sheet';

export interface MobileSurfaceDescriptor {
  id: string;
  kind: MobileSurfaceKind;
  label?: string;
}

interface MobileSurfaceHostValue {
  hostElement: HTMLDivElement | null;
  registerSurface: (descriptor: MobileSurfaceDescriptor) => () => void;
  surfaces: MobileSurfaceDescriptor[];
}

const MobileSurfaceHostContext = React.createContext<MobileSurfaceHostValue | null>(null);

export function MobileSurfaceHost({
  children,
  className,
  style,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) {
  const [hostElement, setHostElement] = React.useState<HTMLDivElement | null>(null);
  const [surfaces, setSurfaces] = React.useState<MobileSurfaceDescriptor[]>([]);

  const registerSurface = React.useCallback((descriptor: MobileSurfaceDescriptor) => {
    setSurfaces((currentValue) => [...currentValue, descriptor]);

    return () => {
      setSurfaces((currentValue) =>
        currentValue.filter((candidate) => candidate.id !== descriptor.id)
      );
    };
  }, []);

  const contextValue = React.useMemo(
    () => ({
      hostElement,
      registerSurface,
      surfaces,
    }),
    [hostElement, registerSurface, surfaces]
  );

  return (
    <MobileSurfaceHostContext.Provider value={contextValue}>
      <div {...props} className={cn('relative min-h-0', className)} style={style}>
        {children}
        <div
          ref={setHostElement}
          className="pointer-events-none absolute inset-0 z-40 overflow-visible"
        />
      </div>
    </MobileSurfaceHostContext.Provider>
  );
}

export function useMobileSurfaceHost(): MobileSurfaceHostValue {
  const context = React.useContext(MobileSurfaceHostContext);

  if (!context) {
    throw new Error('useMobileSurfaceHost must be used within <MobileSurfaceHost>.');
  }

  return context;
}

export function MobileSurfacePortal({
  children,
  descriptor,
}: {
  children: React.ReactNode;
  descriptor: MobileSurfaceDescriptor;
}) {
  const { hostElement, registerSurface } = useMobileSurfaceHost();

  React.useEffect(() => registerSurface(descriptor), [descriptor, registerSurface]);

  if (!hostElement) {
    return null;
  }

  return createPortal(children, hostElement);
}
