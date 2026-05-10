// This is a Next.js 15 compatible version of the GluestackUIProvider
'use client';
import React, { useEffect } from 'react';
import { Uniwind, type ThemeName } from 'uniwind';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';

export function GluestackUIProvider({
  mode,
  ...props
}: {
  mode?: ThemeName | 'system';
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!mode) return;
    Uniwind.setTheme(mode);
  }, [mode]);

  return (
    <OverlayProvider>
      <ToastProvider>{props.children}</ToastProvider>
    </OverlayProvider>
  );
}
