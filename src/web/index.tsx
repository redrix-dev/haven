import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { AppRoot } from '@/renderer/app/AppRoot';
import { MobileRoot } from '@/renderer/app/MobileRoot';
import { registerHavenServiceWorker } from './pwa/registerServiceWorker';
import { startHavenWebPushClient } from './pwa/webPushClient';
import '@/styles/globals.css';
void (async () => {
  const serviceWorkerResult = await registerHavenServiceWorker();
  await startHavenWebPushClient(serviceWorkerResult);
})();

const isMobile = window.innerWidth <= 768;
console.log('isMobile:', isMobile, 'width:', window.innerWidth);
const root = createRoot(document.body);

root.render(
  <TooltipProvider>
    <>
      {isMobile ? <MobileRoot /> : <AppRoot />}

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
  </TooltipProvider>
);
