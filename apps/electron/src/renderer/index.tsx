import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@shared/app/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { registerElectronAppHost } from './registerElectronAppHost';
import { AppRoot } from '@shared/app/AppRoot';
import '@shared/styles/globals.css';

registerElectronAppHost();

const root = createRoot(document.body);

root.render(
  <TooltipProvider>
    <>
      <AppRoot />
      <SonnerToaster
        position="top-right"
        theme="dark"
        closeButton
        toastOptions={{
          className:
            '!bg-surface-toast !border !border-border !text-white !shadow-2xl',
          descriptionClassName: '!text-muted-foreground',
          classNames: {
            actionButton:
              '!bg-primary !text-white !border !border-primary-hover hover:!bg-primary-hover focus:!ring-2 focus:!ring-ring-focus focus:!ring-offset-0',
            cancelButton:
              '!bg-muted !text-white !border !border-border hover:!bg-secondary',
          },
          actionButtonStyle: {
            background: 'var(--primary)',
            color: '#ffffff',
            border: '1px solid var(--primary-hover)',
          },
          cancelButtonStyle: {
            background: 'var(--muted)',
            color: '#ffffff',
            border: '1px solid var(--border)',
          },
          style: {
            background: 'var(--surface-toast)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </>
  </TooltipProvider>
);
