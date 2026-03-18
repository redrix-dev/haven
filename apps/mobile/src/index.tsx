import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@shared/components/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { PlatformRuntimeProvider } from '@platform/runtime/PlatformRuntimeContext';
import { createMobilePlatformRuntime } from '@mobile/runtime/createMobilePlatformRuntime';
import { MobileRoot } from '@mobile/mobile/MobileRoot';
import '@shared/styles/globals.css';

document.documentElement.classList.add('haven-mobile-shell');
document.body.classList.add('haven-mobile-shell');

const runtime = createMobilePlatformRuntime();
const appHost = document.getElementById('haven-mobile-root') ?? document.body;
const root = createRoot(appHost);

root.render(
  <TooltipProvider>
    <PlatformRuntimeProvider runtime={runtime}>
      <>
        <MobileRoot />
        <SonnerToaster
          position="top-right"
          theme="dark"
          closeButton
          toastOptions={{
            className: '!bg-[#162238] !border !border-[#304867] !text-white !shadow-2xl',
            descriptionClassName: '!text-[#a9b8cf]',
          }}
        />
      </>
    </PlatformRuntimeProvider>
  </TooltipProvider>
);
