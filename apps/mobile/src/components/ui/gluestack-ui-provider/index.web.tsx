'use client';
import React, { useEffect } from 'react';
import { Uniwind, type ThemeName } from 'uniwind';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';

export type ModeType = ThemeName | 'system';

export function GluestackUIProvider({
  mode,
  ...props
}: {
  mode?: ModeType;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!mode) return;
    Uniwind.setTheme(mode);
  }, [mode]);

  return (
    <>
      <OverlayProvider>
        <ToastProvider>{props.children}</ToastProvider>
      </OverlayProvider>
    </>
  );
}
