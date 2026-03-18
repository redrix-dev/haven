import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@shared/components/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { AppRoot } from '@client/app/AppRoot';
import { PlatformRuntimeProvider } from '@platform/runtime/PlatformRuntimeContext';
import { createWebPlatformRuntime } from '@web/runtime/createWebPlatformRuntime';
import { registerHavenServiceWorker } from '@platform/runtime/web/registerServiceWorker';
import {
  installHavenPwaRuntimeProbe,
  updateHavenPwaRuntimeProbe,
} from '@platform/runtime/web/runtimeProbe';
import { startHavenWebPushClient } from '@platform/runtime/web/webPushClient';
import { assertWebAppAssetsInDev } from './pwa/assertWebAppAssets';
import { MobileRedirectPage } from './MobileRedirectPage';
import '@shared/styles/globals.css';

document.documentElement.classList.add('haven-web-shell');
document.body.classList.add('haven-web-shell');

installHavenPwaRuntimeProbe();

void (async () => {
  await assertWebAppAssetsInDev();
  const serviceWorkerResult = await registerHavenServiceWorker();
  updateHavenPwaRuntimeProbe(serviceWorkerResult);
  await startHavenWebPushClient(serviceWorkerResult);
})();

const runtime = createWebPlatformRuntime();
const isPhoneBrowser =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

const appHost = document.getElementById('haven-web-root') ?? document.body;
const root = createRoot(appHost);

root.render(
  <TooltipProvider>
    <PlatformRuntimeProvider runtime={runtime}>
      <>
        {isPhoneBrowser ? <MobileRedirectPage /> : <AppRoot />}
        <SonnerToaster
          position="top-right"
          theme="dark"
          closeButton
          toastOptions={{
            className: '!bg-[#162238] !border !border-[#304867] !text-white !shadow-2xl',
            descriptionClassName: '!text-[#a9b8cf]',
            classNames: {
              actionButton:
                '!bg-[#3f79d8] !text-white !border !border-[#325fae] hover:!bg-[#325fae] focus:!ring-2 focus:!ring-[#6ea2ff] focus:!ring-offset-0',
              cancelButton:
                '!bg-[#1d2a42] !text-white !border !border-[#304867] hover:!bg-[#22324d]',
            },
            actionButtonStyle: {
              background: '#3f79d8',
              color: '#ffffff',
              border: '1px solid #325fae',
            },
            cancelButtonStyle: {
              background: '#1d2a42',
              color: '#ffffff',
              border: '1px solid #304867',
            },
            style: {
              background: '#162238',
              color: '#e6edf7',
              border: '1px solid #304867',
            },
          }}
        />
      </>
    </PlatformRuntimeProvider>
  </TooltipProvider>
);
