import { bootLogger } from '@shared/debug/bootLogger';
bootLogger.mark('js-entry');

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createHavenSupabaseClient } from '@shared/lib/createHavenSupabaseClient';
import { createHavenCore, createMemoryPersistence } from '@shared/core';
import { createReactHavenCoreOptions } from '@mobile-data/createReactHavenCore';
import { TooltipProvider } from '@shared/app/ui/tooltip';
import { Toaster as SonnerToaster } from 'sonner';
import { registerElectronAppHost } from './registerElectronAppHost';
import { AppRoot } from '@web-client/AppRoot';
import { BootLogPanel } from '@web-client/debug/BootLogPanel';
import '@shared/styles/globals.css';
import { applyShellThemeTokens, setShellThemeApplier } from '@web-client/shellThemeRegistry';
import { readSessionStoredThemeId } from '@shared/themes/sessionThemeStorage';
import { getTheme } from '@shared/themes/registry';
import { applyThemeWeb } from './lib/theme';
import { ElectronThemeDemoMenu } from './dev/ElectronThemeDemoMenu';
import { ElectronThemeLab } from './dev/ElectronThemeLab';

registerElectronAppHost();
bootLogger.mark('app-host-registered');
setShellThemeApplier(applyThemeWeb);
applyShellThemeTokens(getTheme(readSessionStoredThemeId() ?? 'default').tokens);
bootLogger.mark('theme-applied');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY for electron renderer bootstrap.');
}
bootLogger.mark('supabase-client-created');
const havenElectronClient = createHavenSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: false,
  },
});
createHavenCore(
  createReactHavenCoreOptions({
    client: havenElectronClient,
    publicConfig: { supabaseUrl, supabaseAnonKey },
    persistence: createMemoryPersistence(),
  }),
);
bootLogger.mark('core-created');

bootLogger.mark('react-render-start');
const root = createRoot(document.body);

root.render(
  <TooltipProvider>
    <>
      <AppRoot />
      <BootLogPanel />
      {process.env.NODE_ENV !== 'production' && (
        <>
          <ElectronThemeDemoMenu />
          <ElectronThemeLab />
        </>
      )}
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
            color: 'var(--primary-foreground)',
            border: '1px solid var(--primary-hover)',
          },
          cancelButtonStyle: {
            background: 'var(--muted)',
            color: 'var(--foreground)',
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
